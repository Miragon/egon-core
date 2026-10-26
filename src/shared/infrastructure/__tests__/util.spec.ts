import { describe, expect, it } from "vitest";

import { getAnnotationBracketSvg } from "../util";

/**
 * Upstream's getScaledPath, called only with mx=my=0 and scale 1, yields
 * `m 0, 0 m 10,0 l -10,0 l 0,<height> l 10,0`; these pin that exact output.
 */
describe("getAnnotationBracketSvg", () => {
    it("reproduces the old getScaledPath output for the default 30px height", () => {
        expect(getAnnotationBracketSvg(30)).toBe(
            "m 0, 0 m 10,0 l -10,0 l 0,30 l 10,0",
        );
    });

    it("scales the bracket spine to a non-default height", () => {
        expect(getAnnotationBracketSvg(85)).toBe(
            "m 0, 0 m 10,0 l -10,0 l 0,85 l 10,0",
        );
    });
});
