import { describe, expect, it } from "vitest";

import { DEFAULT_COLOR, isDefaultColor } from "../color";

/**
 * Issue #74: `getIconSvg` used to decide "the user picked a colour" with
 * `pickedColor !== DEFAULT_COLOR`, which reads a file written before #65 — where
 * the renderer stamped the literal `"black"` — as a custom colour, and fires a
 * bogus "only SVG icons can be coloured" error for a raster custom icon in it.
 * The cases below are the literals the format actually contains.
 */
describe("isDefaultColor", () => {
    it("treats every literal historical versions wrote for the default as default", () => {
        // `"black"` is the one that matters: pre-#65 renderers persisted it, so
        // it is the default in intent while differing from it by string equality.
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
        // The normal state: `pickedColor` is nullable and absent means "the
        // renderer decides" (#65). An empty string is not a colour anyone
        // picked either, and the guard this replaced (`pickedColor && …`)
        // skipped it too.
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
