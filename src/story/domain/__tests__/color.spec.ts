import { describe, expect, it } from "vitest";

import { DEFAULT_COLOR, isDefaultColor } from "../color";

describe("isDefaultColor", () => {
    it("treats every literal historical versions wrote for the default as default", () => {
        // Older renderers persisted `"black"`: default in intent, but not equal
        // to DEFAULT_COLOR as a string.
        expect(isDefaultColor("black")).toBe(true);
        expect(isDefaultColor("#000")).toBe(true);
        expect(isDefaultColor("#000000")).toBe(true);
        expect(isDefaultColor(DEFAULT_COLOR)).toBe(true);
    });

    it("ignores case and surrounding whitespace", () => {
        expect(isDefaultColor("BLACK")).toBe(true);
        expect(isDefaultColor("#000000".toUpperCase())).toBe(true);
        expect(isDefaultColor("  #000  ")).toBe(true);
    });

    it("treats a missing colour as default", () => {
        // Absent means "the renderer decides"; "" is no choice either.
        expect(isDefaultColor(undefined)).toBe(true);
        expect(isDefaultColor(null)).toBe(true);
        expect(isDefaultColor("")).toBe(true);
    });

    it("reports a colour the user actually picked", () => {
        expect(isDefaultColor("#ff0000")).toBe(false);
        expect(isDefaultColor("white")).toBe(false);
        // Near-misses stay custom: only the exact literals count, so a dark grey
        // is not silently laundered into "no choice made".
        expect(isDefaultColor("#000001")).toBe(false);
        expect(isDefaultColor("#0000")).toBe(false);
        expect(isDefaultColor("rgb(0, 0, 0)")).toBe(false);
    });
});
