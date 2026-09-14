import { describe, expect, it } from "vitest";
import { positionsMatch } from "../mathExtensions";

describe("positionsMatch", () => {
    it("accepts a click strictly inside a translated rectangle", () => {
        expect(positionsMatch(40, 20, 10, 30, 25, 35)).toBe(true);
    });

    it.each([
        [10, 35],
        [50, 35],
        [25, 30],
        [25, 50],
        [9, 35],
        [51, 35],
        [25, 29],
        [25, 51],
    ])("excludes boundary and outside clicks at (%s, %s)", (x, y) => {
        expect(positionsMatch(40, 20, 10, 30, x, y)).toBe(false);
    });

    it("does not hit an empty rectangle", () => {
        expect(positionsMatch(0, 20, 10, 30, 10, 35)).toBe(false);
        expect(positionsMatch(40, 0, 10, 30, 25, 30)).toBe(false);
    });
});
