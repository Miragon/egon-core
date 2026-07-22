import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
    ICON_CSS_CLASS_PREFIX,
    IconDictionaryService,
} from "../IconDictionaryService";
import { Dictionary } from "../../../domain/entities/dictionary";

/**
 * Regression cover for issue #4: a custom icon whose name contains a dot must
 * still yield a valid CSS class, and the class the palette looks up
 * (`getCSSClassOfIcon`) must be the exact one `addIconsToCss` writes a rule for.
 */
describe("IconDictionaryService CSS class generation", () => {
    it("turns a dot-containing name into a valid CSS class token", () => {
        const service = new IconDictionaryService();

        const cssClass = service.getCSSClassOfIcon("my.icon.v2");

        expect(cssClass).toBe("icon-domain-story-my_icon_v2");
        // Stripped of the prefix, the token must be a legal CSS identifier
        // (starts with a letter/underscore, no dots) — the actual bug was that
        // the old sanitizer left the interior dots in place.
        expect(cssClass.slice(ICON_CSS_CLASS_PREFIX.length)).toMatch(
            /^[a-zA-Z_][a-zA-Z0-9_-]*$/,
        );
    });

    describe("addIconsToCss", () => {
        beforeEach(() => {
            const style = document.createElement("style");
            style.id = "iconsCss";
            document.head.appendChild(style);
        });

        afterEach(() => {
            document.getElementById("iconsCss")?.remove();
        });

        it("inserts a rule the palette class actually hits", () => {
            const service = new IconDictionaryService();
            const icons = new Dictionary();
            icons.add("<svg/>", "my.icon.v2");

            service.addIconsToCss(icons);

            const sheet = (
                document.getElementById("iconsCss") as HTMLStyleElement
            ).sheet!;
            const rule = sheet.cssRules[0] as CSSStyleRule;

            expect(rule.selectorText).toBe(
                ".icon-domain-story-my_icon_v2::before",
            );
            expect(rule.cssText).toContain("mask-image");
            // The regression itself: the class the palette computes must match
            // the selector of the rule we just inserted.
            expect(rule.selectorText).toBe(
                "." + service.getCSSClassOfIcon("my.icon.v2") + "::before",
            );
        });
    });
});
