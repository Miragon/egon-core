import { describe, expect, it } from "vitest";

import { computeReplaceMenuPosition } from "../DomainStoryContextPadProvider";

/**
 * Regression tests for the replace ("Change type") popup positioning (issue #6,
 * upstream #265). `computeReplaceMenuPosition` replaced the deprecated
 * `ContextPad#getPad()` lookup — which warned and could spawn a stray pad DOM
 * element — with a scoped `.djs-context-pad.open` DOM query. jsdom (the global
 * test environment) supplies the DOM these functions read; because it returns
 * all-zero `getBoundingClientRect()` by default, both rects are stubbed so the
 * pad-relative offset math is observable.
 */

/** A DOMRect stub carrying only the fields the position math consumes. */
function rect(values: Partial<DOMRect>): () => DOMRect {
    return () =>
        ({
            left: 0,
            top: 0,
            width: 0,
            height: 0,
            ...values,
        }) as DOMRect;
}

/**
 * Build a diagram container with an optional context pad child. The pad's class
 * list is caller-controlled so tests can prove the `open` class is what gates
 * the match — the stray-pad case the deprecation was steering away from.
 */
function setup(
    options: {
        padClassName?: string;
        containerRect?: Partial<DOMRect>;
        padRect?: Partial<DOMRect>;
    } = {},
): HTMLElement {
    const container = document.createElement("div");
    container.getBoundingClientRect = rect(options.containerRect ?? {});

    if (options.padClassName !== undefined) {
        const pad = document.createElement("div");
        pad.className = options.padClassName;
        pad.getBoundingClientRect = rect(options.padRect ?? {});
        container.appendChild(pad);
    }

    return container;
}

describe("computeReplaceMenuPosition", () => {
    it("positions the menu below the open pad, relative to the container", () => {
        const container = setup({
            padClassName: "djs-context-pad open",
            containerRect: { left: 100, top: 50 },
            padRect: { left: 130, top: 90, height: 40 },
        });

        // x = padLeft - containerLeft; y = padTop - containerTop + height + 5
        expect(computeReplaceMenuPosition(container)).toEqual({
            x: 30,
            y: 90 - 50 + 40 + 5,
        });
    });

    it("returns null when no context pad exists", () => {
        expect(computeReplaceMenuPosition(setup())).toBeNull();
    });

    it("ignores a pad that is not open, guarding the stray-pad case", () => {
        // A pad element without the `open` class must not be matched — this is
        // exactly the stray pad the deprecated getPad() could create.
        const container = setup({ padClassName: "djs-context-pad" });
        expect(computeReplaceMenuPosition(container)).toBeNull();
    });
});
