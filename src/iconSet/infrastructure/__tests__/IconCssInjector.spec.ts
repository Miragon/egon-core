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
     * Attachment is not incidental: `HTMLStyleElement.sheet` stays `null` while
     * the node is outside a document, so a detached container silences every
     * insert and the assertions below would pass vacuously.
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

        const encoded =
            rulesOf(styleElement)[0]!.cssText.match(/base64,([^')]+)/)![1]!;

        expect(atob(encoded)).toBe("<svg><path/></svg>");
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

    it("is a silent no-op once its style element is detached", () => {
        // The post-destroy() path: removing the node nulls its `sheet`, so a
        // late icon write lands nowhere instead of throwing.
        const styleElement = createStyleElement();
        const injector = new IconCssInjector({ styleElement });
        styleElement.remove();

        expect(() =>
            injector.addIconStyle("icon-domain-story-late", "<svg/>"),
        ).not.toThrow();
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
});
