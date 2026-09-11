import { afterEach, describe, expect, it } from "vitest";
import { IconCssInjector } from "../IconCssInjector";

const SCOPE_ID = "scope-a";

function scopedSelector(cssClassName: string, scopeId = SCOPE_ID): string {
    return `[data-egon-icon-scope="${scopeId}"] .${cssClassName}::before`;
}

function injectorFor(
    styleElement: HTMLStyleElement,
    scopeId = SCOPE_ID,
): IconCssInjector {
    return new IconCssInjector({ styleElement, scopeId });
}

/**
 * Covers the DOM/CSSOM seam moved out of IconDictionaryService: the adapter
 * must write a rule whose icon class is exactly the class it was handed (the
 * issue-#4 contract, now enforced from the service side), scope that rule to
 * the configured editor session, strip an SVG's width/height before encoding
 * it, and write into the `<style>` node it was configured with.
 */
describe("IconCssInjector", () => {
    const containers: HTMLElement[] = [];

    afterEach(() => {
        containers.splice(0).forEach((container) => container.remove());
    });

    /**
     * A container attached to the document, plus its own `<style>`.
     *
     * Attachment is not incidental for CSSOM assertions:
     * `HTMLStyleElement.sheet` stays `null` while the node is outside a
     * document. Detached-state cases inspect `textContent` before attaching.
     */
    function createStyleElement(): HTMLStyleElement {
        const container = document.createElement("div");
        document.body.appendChild(container);
        containers.push(container);

        const style = document.createElement("style");
        style.setAttribute("data-egon-icons-css", "");
        container.appendChild(style);
        return style;
    }

    function rulesOf(style: HTMLStyleElement): CSSStyleRule[] {
        return Array.from(style.sheet!.cssRules) as CSSStyleRule[];
    }

    function encodedSvg(rule: CSSStyleRule): string {
        const encoded = rule.cssText.match(/base64,([^')]+)/)![1]!;
        return new TextDecoder().decode(
            Uint8Array.from(atob(encoded), (character) =>
                character.charCodeAt(0),
            ),
        );
    }

    it("inserts a rule scoped to the configured session and exact class", () => {
        const styleElement = createStyleElement();

        injectorFor(styleElement).addIconStyle(
            "icon-domain-story-my_icon_v2",
            "<svg/>",
        );

        const rule = rulesOf(styleElement)[0]!;
        expect(rule.selectorText).toBe(
            scopedSelector("icon-domain-story-my_icon_v2"),
        );
        expect(rule.cssText).toContain("mask-image");
    });

    it("strips width/height from the SVG before encoding it", () => {
        const styleElement = createStyleElement();

        injectorFor(styleElement).addIconStyle(
            "icon-domain-story-sized",
            '<svg width="24" height="24"><path/></svg>',
        );

        expect(encodedSvg(rulesOf(styleElement)[0]!)).toBe(
            "<svg><path/></svg>",
        );
    });

    it("UTF-8 encodes text artwork instead of throwing through btoa", () => {
        const styleElement = createStyleElement();

        injectorFor(styleElement).addIconStyle(
            "icon-domain-story-text",
            "<svg><text>Grüße</text></svg>",
        );

        expect(encodedSvg(rulesOf(styleElement)[0]!)).toBe(
            "<svg><text>Grüße</text></svg>",
        );
    });

    it("is a silent no-op when the stylesheet or scope is missing", () => {
        // A host booting the icon module without the modeler adapter gets no
        // `config.domainStoryIconStyleSheet` at all.
        expect(() =>
            new IconCssInjector().addIconStyle("icon-domain-story-x", "<svg/>"),
        ).not.toThrow();
        expect(() =>
            new IconCssInjector({}).addIconStyle(
                "icon-domain-story-x",
                "<svg/>",
            ),
        ).not.toThrow();

        const styleElement = createStyleElement();
        expect(() =>
            new IconCssInjector({ styleElement }).addIconStyle(
                "icon-domain-story-x",
                "<svg/>",
            ),
        ).not.toThrow();
        expect(styleElement.textContent).toBe("");
    });

    it("retains a rule added while detached and activates it on attachment", () => {
        const container = document.createElement("div");
        containers.push(container);
        const styleElement = document.createElement("style");
        const injector = injectorFor(styleElement);

        injector.addIconStyle("icon-domain-story-late", "<svg>late</svg>");

        expect(styleElement.sheet).toBeNull();
        expect(styleElement.textContent).toContain(
            scopedSelector("icon-domain-story-late"),
        );

        container.appendChild(styleElement);
        document.body.appendChild(container);

        expect(rulesOf(styleElement)).toHaveLength(1);
        expect(encodedSvg(rulesOf(styleElement)[0]!)).toBe("<svg>late</svg>");
    });

    it("replaces a detached rule before attachment", () => {
        const container = document.createElement("div");
        containers.push(container);
        const styleElement = document.createElement("style");
        const injector = injectorFor(styleElement);

        injector.addIconStyle("icon-domain-story-late", "<svg>A</svg>");
        injector.addIconStyle("icon-domain-story-late", "<svg>B</svg>");
        container.appendChild(styleElement);
        document.body.appendChild(container);

        expect(rulesOf(styleElement)).toHaveLength(1);
        expect(encodedSvg(rulesOf(styleElement)[0]!)).toBe("<svg>B</svg>");
    });

    it("keeps and replaces rules across detach and reattach", () => {
        const styleElement = createStyleElement();
        const container = styleElement.parentElement!;
        const injector = injectorFor(styleElement);
        injector.addIconStyle("icon-domain-story-kept", "<svg>A</svg>");
        styleElement.remove();

        injector.addIconStyle("icon-domain-story-kept", "<svg>B</svg>");
        expect(styleElement.sheet).toBeNull();

        container.appendChild(styleElement);

        expect(rulesOf(styleElement)).toHaveLength(1);
        expect(encodedSvg(rulesOf(styleElement)[0]!)).toBe("<svg>B</svg>");
    });

    it("replaces a class rule instead of appending a duplicate", () => {
        const styleElement = createStyleElement();
        const injector = injectorFor(styleElement);

        injector.addIconStyle("icon-domain-story-same", "<svg>A</svg>");
        injector.addIconStyle("icon-domain-story-same", "<svg>B</svg>");

        // Reread `.sheet`: replacing style text may replace the CSSStyleSheet
        // object itself in a real browser.
        expect(rulesOf(styleElement)).toHaveLength(1);
        expect(encodedSvg(rulesOf(styleElement)[0]!)).toBe("<svg>B</svg>");
    });

    it("does not rewrite an unchanged class rule", () => {
        const styleElement = createStyleElement();
        const injector = injectorFor(styleElement);
        injector.addIconStyle("icon-domain-story-same", "<svg>A</svg>");
        const sheetAfterFirstWrite = styleElement.sheet;

        injector.addIconStyle("icon-domain-story-same", "<svg>A</svg>");

        expect(styleElement.sheet).toBe(sheetAfterFirstWrite);
        expect(rulesOf(styleElement)).toHaveLength(1);
    });

    it("retains distinct class rules when one class is replaced", () => {
        const styleElement = createStyleElement();
        const injector = injectorFor(styleElement);

        injector.addIconStyle("icon-domain-story-a", "<svg>A1</svg>");
        injector.addIconStyle("icon-domain-story-b", "<svg>B</svg>");
        injector.addIconStyle("icon-domain-story-a", "<svg>A2</svg>");

        expect(
            rulesOf(styleElement).map((rule) => [
                rule.selectorText,
                encodedSvg(rule),
            ]),
        ).toEqual([
            [scopedSelector("icon-domain-story-a"), "<svg>A2</svg>"],
            [scopedSelector("icon-domain-story-b"), "<svg>B</svg>"],
        ]);
    });

    it("uses last-publication precedence for sanitized-name collisions", () => {
        const styleElement = createStyleElement();
        const injector = injectorFor(styleElement);

        // The service sanitizes both source names to this same class before
        // reaching the port; the port therefore replaces by class identity.
        injector.addIconStyle("icon-domain-story-a_b", "<svg>dot</svg>");
        injector.addIconStyle("icon-domain-story-a_b", "<svg>space</svg>");

        expect(rulesOf(styleElement)).toHaveLength(1);
        expect(encodedSvg(rulesOf(styleElement)[0]!)).toBe("<svg>space</svg>");
    });

    it("writes only into its own sheet when two injectors coexist", () => {
        // The headline #69 case: before the fix both injectors resolved the
        // single `#iconsCss` node, so B's rules landed in A's sheet — and
        // removing either sheet on destroy took the other's rules with it.
        const styleA = createStyleElement();
        const styleB = createStyleElement();

        injectorFor(styleA, "scope-a").addIconStyle(
            "icon-domain-story-a",
            "<svg/>",
        );
        injectorFor(styleB, "scope-b").addIconStyle(
            "icon-domain-story-b",
            "<svg/>",
        );

        expect(rulesOf(styleA).map((rule) => rule.selectorText)).toEqual([
            scopedSelector("icon-domain-story-a", "scope-a"),
        ]);
        expect(rulesOf(styleB).map((rule) => rule.selectorText)).toEqual([
            scopedSelector("icon-domain-story-b", "scope-b"),
        ]);
    });

    it("keeps replacement state owned by each injector", () => {
        const styleA = createStyleElement();
        const styleB = createStyleElement();
        const injectorA = injectorFor(styleA, "scope-a");
        const injectorB = injectorFor(styleB, "scope-b");

        injectorA.addIconStyle("icon-domain-story-shared", "<svg>A1</svg>");
        injectorB.addIconStyle("icon-domain-story-shared", "<svg>B</svg>");
        injectorA.addIconStyle("icon-domain-story-shared", "<svg>A2</svg>");

        expect(encodedSvg(rulesOf(styleA)[0]!)).toBe("<svg>A2</svg>");
        expect(encodedSvg(rulesOf(styleB)[0]!)).toBe("<svg>B</svg>");
    });
});
