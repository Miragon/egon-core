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

/**
 * `config.textRenderer` was declared in `$inject` but never taken by the
 * constructor, so a host's typography was accepted and silently dropped. These
 * cases pin the merge order the injection restores.
 */
describe("DomainStoryTextRenderer config", () => {
    it("merges a partial defaultStyle over the built-in defaults", () => {
        const renderer = new DomainStoryTextRenderer({
            defaultStyle: { fontFamily: "Comic Sans MS" },
        });

        expect(renderer.getDefaultStyle().fontFamily).toBe("Comic Sans MS");
        // untouched keys survive — a host may override one property alone
        expect(renderer.getDefaultStyle().fontSize).toBe(12);
        expect(renderer.getDefaultStyle().fontWeight).toBe("normal");
    });

    it("derives the external style from the merged default, one point smaller", () => {
        const renderer = new DomainStoryTextRenderer({
            defaultStyle: { fontSize: 20, fontFamily: "Georgia" },
        });

        expect(renderer.getExternalStyle().fontSize).toBe(19);
        expect(renderer.getExternalStyle().fontFamily).toBe("Georgia");
    });

    it("lets an explicit externalStyle win over the derived one", () => {
        const renderer = new DomainStoryTextRenderer({
            defaultStyle: { fontSize: 20 },
            externalStyle: { fontSize: 8 },
        });

        expect(renderer.getDefaultStyle().fontSize).toBe(20);
        expect(renderer.getExternalStyle().fontSize).toBe(8);
    });

    it("keeps the built-in defaults when the host config is empty", () => {
        const renderer = new DomainStoryTextRenderer({});

        expect(renderer.getDefaultStyle().fontSize).toBe(12);
        expect(renderer.getExternalStyle().fontSize).toBe(11);
    });
});
