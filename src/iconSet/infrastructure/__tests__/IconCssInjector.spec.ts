import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { IconCssInjector } from "../IconCssInjector";

/**
 * Covers the DOM/CSSOM seam moved out of IconDictionaryService: the adapter
 * must write a rule whose selector is exactly the class it was handed (the
 * issue-#4 contract, now enforced from the service side) and must strip an
 * SVG's width/height before encoding it (previously untested, since the
 * service-level test only asserted the selector).
 */
describe("IconCssInjector", () => {
    beforeEach(() => {
        const style = document.createElement("style");
        style.id = "iconsCss";
        document.head.appendChild(style);
    });

    afterEach(() => {
        document.getElementById("iconsCss")?.remove();
    });

    function firstRule(): CSSStyleRule {
        const sheet = (document.getElementById("iconsCss") as HTMLStyleElement)
            .sheet!;
        return sheet.cssRules[0] as CSSStyleRule;
    }

    it("inserts a rule whose selector is exactly the class it was given", () => {
        new IconCssInjector().addIconStyle(
            "icon-domain-story-my_icon_v2",
            "<svg/>",
        );

        const rule = firstRule();
        expect(rule.selectorText).toBe(".icon-domain-story-my_icon_v2::before");
        expect(rule.cssText).toContain("mask-image");
    });

    it("strips width/height from the SVG before encoding it", () => {
        new IconCssInjector().addIconStyle(
            "icon-domain-story-sized",
            '<svg width="24" height="24"><path/></svg>',
        );

        const encoded = firstRule().cssText.match(/base64,([^')]+)/)![1];
        const decodedSvg = atob(encoded);

        expect(decodedSvg).toBe("<svg><path/></svg>");
    });

    it("is a silent no-op when the #iconsCss sheet is absent", () => {
        document.getElementById("iconsCss")?.remove();

        expect(() =>
            new IconCssInjector().addIconStyle("icon-domain-story-x", "<svg/>"),
        ).not.toThrow();
    });
});
