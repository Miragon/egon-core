import { describe, expect, it } from "vitest";

import { DomainStoryTextRenderer } from "../DomainStoryTextRenderer";

/**
 * Regression lock for the shared-default-style mutation (finding A2). The
 * external style was built with `assign(defaultStyle, …)` — min-dash `assign`
 * is `Object.assign`, so it wrote through to the default style and handed back
 * that same object. Both styles ended up at 11px, shrinking every label and
 * every annotation-height measurement by a point.
 */
describe("DomainStoryTextRenderer styles", () => {
    it("keeps the default style at 12px and the external style one point smaller", () => {
        const renderer = new DomainStoryTextRenderer();

        expect(renderer.getDefaultStyle()?.fontSize).toBe(12);
        expect(renderer.getExternalStyle()?.fontSize).toBe(11);
    });

    it("does not alias the two styles onto one object", () => {
        const renderer = new DomainStoryTextRenderer();

        expect(renderer.getExternalStyle()).not.toBe(
            renderer.getDefaultStyle(),
        );
    });
});
