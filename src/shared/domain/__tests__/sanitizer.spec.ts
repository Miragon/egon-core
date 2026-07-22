import { describe, expect, it } from "vitest";
import { sanitizeForCss } from "../sanitizer";

/**
 * `sanitizeForCss` turns an arbitrary icon name into a valid CSS class token.
 * The regression (issue #4): dot-containing names used to be truncated at the
 * last dot, producing selectors like `.icon-...-my.icon` that never match.
 */
describe("sanitizeForCss", () => {
    it("replaces interior dots with underscores instead of truncating", () => {
        expect(sanitizeForCss("my.icon.v2")).toBe("my_icon_v2");
    });

    it("prefixes a leading digit with an underscore", () => {
        expect(sanitizeForCss("2fa")).toBe("_2fa");
    });

    it("prefixes a leading '-<digit>' with an underscore", () => {
        expect(sanitizeForCss("-2fa")).toBe("_-2fa");
    });

    it("lowercases the result for stable matching", () => {
        expect(sanitizeForCss("MyIcon")).toBe("myicon");
    });

    it("leaves an already-safe name unchanged", () => {
        expect(sanitizeForCss("person-2")).toBe("person-2");
    });

    it("replaces every CSS-special char and space with an underscore", () => {
        expect(sanitizeForCss("Ä b:c")).toBe("__b_c");
    });
});
