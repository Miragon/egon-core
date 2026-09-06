import { describe, expect, it } from "vitest";
import {
    sanitizeForCss,
    sanitizeForDesktop,
    sanitizeTextForSVGExport,
    unsanitizeTextForSVGExport,
} from "../sanitizer";

describe("sanitizeTextForSVGExport", () => {
    it("replaces repeated angle brackets", () => {
        expect(sanitizeTextForSVGExport("<<tag>>")).toBe("&lt;&lt;tag&gt;&gt;");
    });

    it("combines dash and angle-bracket substitutions", () => {
        expect(sanitizeTextForSVGExport("a--b <c> -- d")).toBe(
            "a––b &lt;c&gt; –– d",
        );
    });

    it("handles an empty string", () => {
        expect(sanitizeTextForSVGExport("")).toBe("");
    });
});

describe("unsanitizeTextForSVGExport", () => {
    it("reverses the sanitizer's three substitutions", () => {
        const original = "a--b <c> -- d";

        expect(
            unsanitizeTextForSVGExport(sanitizeTextForSVGExport(original)),
        ).toBe(original);
    });

    it("handles an empty string", () => {
        expect(unsanitizeTextForSVGExport("")).toBe("");
    });

    it("documents the lossy literal-entity behavior", () => {
        expect(unsanitizeTextForSVGExport("literal &lt;x&gt;")).toBe(
            "literal <x>",
        );
    });

    it("documents the lossy literal-en-dash-pair behavior", () => {
        expect(unsanitizeTextForSVGExport("literal –– pair")).toBe(
            "literal -- pair",
        );
    });
});

describe("sanitizeForDesktop", () => {
    it("keeps filename sanitization behavior while retaining dash mapping", () => {
        expect(sanitizeForDesktop('a--b/<c>:"d"')).toBe("a––bcd");
    });
});

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
