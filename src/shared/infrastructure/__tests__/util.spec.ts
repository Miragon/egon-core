import { describe, expect, it } from "vitest";

import { getAnnotationBracketSvg } from "../util";

/**
 * Guards the one-liner that replaced the ~140-line bpmn-js-derived
 * getScaledPath (upstream wps/egon.io@50da3d62). getScaledPath was only ever
 * called to draw the text-annotation bracket with mx=my=0 and scale 1, where
 * its output collapses to `m 0, 0 m 10,0 l -10,0 l 0,<height> l 10,0`. These
 * assertions pin that byte-identical result so the simplification stays
 * faithful.
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
