import { afterEach, describe, expect, it } from "vitest";
import { IconCssInjector } from "../IconCssInjector";

/**
 * Covers the DOM/CSSOM seam moved out of IconDictionaryService: the adapter
 * must write a rule whose selector is exactly the class it was handed (the
 * issue-#4 contract, now enforced from the service side), must strip an SVG's
 * width/height before encoding it, and — since #69 — must write into the
 * `<style>` node it was *configured* with rather than a document-global one.
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
        return atob(encoded);
    }

    it("inserts a rule whose selector is exactly the class it was given", () => {
        const styleElement = createStyleElement();

        new IconCssInjector({ styleElement }).addIconStyle(
            "icon-domain-story-my_icon_v2",
            "<svg/>",
        );

        const rule = rulesOf(styleElement)[0]!;
        expect(rule.selectorText).toBe(".icon-domain-story-my_icon_v2::before");
        expect(rule.cssText).toContain("mask-image");
    });

    it("strips width/height from the SVG before encoding it", () => {
        const styleElement = createStyleElement();

        new IconCssInjector({ styleElement }).addIconStyle(
            "icon-domain-story-sized",
            '<svg width="24" height="24"><path/></svg>',
        );

        expect(encodedSvg(rulesOf(styleElement)[0]!)).toBe(
            "<svg><path/></svg>",
        );
    });

    it("is a silent no-op when no style element is configured", () => {
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
    });

    it("retains a rule added while detached and activates it on attachment", () => {
        const container = document.createElement("div");
        containers.push(container);
        const styleElement = document.createElement("style");
        const injector = new IconCssInjector({ styleElement });

        injector.addIconStyle("icon-domain-story-late", "<svg>late</svg>");

        expect(styleElement.sheet).toBeNull();
        expect(styleElement.textContent).toContain(
            ".icon-domain-story-late::before",
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
        const injector = new IconCssInjector({ styleElement });

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
        const injector = new IconCssInjector({ styleElement });
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
        const injector = new IconCssInjector({ styleElement });

        injector.addIconStyle("icon-domain-story-same", "<svg>A</svg>");
        injector.addIconStyle("icon-domain-story-same", "<svg>B</svg>");

        // Reread `.sheet`: replacing style text may replace the CSSStyleSheet
        // object itself in a real browser.
        expect(rulesOf(styleElement)).toHaveLength(1);
        expect(encodedSvg(rulesOf(styleElement)[0]!)).toBe("<svg>B</svg>");
    });

    it("does not rewrite an unchanged class rule", () => {
        const styleElement = createStyleElement();
        const injector = new IconCssInjector({ styleElement });
        injector.addIconStyle("icon-domain-story-same", "<svg>A</svg>");
        const sheetAfterFirstWrite = styleElement.sheet;

        injector.addIconStyle("icon-domain-story-same", "<svg>A</svg>");

        expect(styleElement.sheet).toBe(sheetAfterFirstWrite);
        expect(rulesOf(styleElement)).toHaveLength(1);
    });

    it("retains distinct class rules when one class is replaced", () => {
        const styleElement = createStyleElement();
        const injector = new IconCssInjector({ styleElement });

        injector.addIconStyle("icon-domain-story-a", "<svg>A1</svg>");
        injector.addIconStyle("icon-domain-story-b", "<svg>B</svg>");
        injector.addIconStyle("icon-domain-story-a", "<svg>A2</svg>");

        expect(
            rulesOf(styleElement).map((rule) => [
                rule.selectorText,
                encodedSvg(rule),
            ]),
        ).toEqual([
            [".icon-domain-story-a::before", "<svg>A2</svg>"],
            [".icon-domain-story-b::before", "<svg>B</svg>"],
        ]);
    });

    it("uses last-publication precedence for sanitized-name collisions", () => {
        const styleElement = createStyleElement();
        const injector = new IconCssInjector({ styleElement });

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

        new IconCssInjector({ styleElement: styleA }).addIconStyle(
            "icon-domain-story-a",
            "<svg/>",
        );
        new IconCssInjector({ styleElement: styleB }).addIconStyle(
            "icon-domain-story-b",
            "<svg/>",
        );

        expect(rulesOf(styleA).map((rule) => rule.selectorText)).toEqual([
            ".icon-domain-story-a::before",
        ]);
        expect(rulesOf(styleB).map((rule) => rule.selectorText)).toEqual([
            ".icon-domain-story-b::before",
        ]);
    });

    it("keeps replacement state owned by each injector", () => {
        const styleA = createStyleElement();
        const styleB = createStyleElement();
        const injectorA = new IconCssInjector({ styleElement: styleA });
        const injectorB = new IconCssInjector({ styleElement: styleB });

        injectorA.addIconStyle("icon-domain-story-shared", "<svg>A1</svg>");
        injectorB.addIconStyle("icon-domain-story-shared", "<svg>B</svg>");
        injectorA.addIconStyle("icon-domain-story-shared", "<svg>A2</svg>");

        expect(encodedSvg(rulesOf(styleA)[0]!)).toBe("<svg>A2</svg>");
        expect(encodedSvg(rulesOf(styleB)[0]!)).toBe("<svg>B</svg>");
    });
});
