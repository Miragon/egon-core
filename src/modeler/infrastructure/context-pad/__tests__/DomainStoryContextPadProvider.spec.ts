import { describe, expect, it, vi } from "vitest";

import {
    computeReplaceMenuPosition,
    DomainStoryContextPadProvider,
} from "../DomainStoryContextPadProvider";
import { ElementTypes } from "../../../../story/domain/elementTypes";

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

/**
 * Behavioral tests for the host color-picker contract (issue #46, upstream
 * `e21c72ee`). The core owns no picker UI: it exposes a `colorChange` pad
 * entry and applies whatever color the host reports back via a document-level
 * `pickedColor` event. These tests drive that round-trip directly on a provider
 * instance, asserting the resulting `element.colorChange` command executions.
 *
 * Each provider registers a permanent `document` listener that cannot be
 * removed, so `provider()` builds a fresh instance with its own `commandStack`
 * spy per test — stale listeners from earlier tests fire against their own
 * (now-irrelevant) spies and never touch the spy under assertion.
 */

/** A minimal element carrying only what the color-change path reads. */
function element(id: string, type: ElementTypes, pickedColor?: string): any {
    return { id, type, businessObject: { pickedColor } };
}

/**
 * Construct a provider with just enough mocks to reach the color-change path,
 * returning the spies the tests assert on. `rules.allowed` → true so the delete
 * entry (a prerequisite sibling of colorChange) is emitted without error.
 */
function provider() {
    const commandStack = { execute: vi.fn(), registerHandler: vi.fn() };
    const dirtyFlagService = { makeDirty: vi.fn() };

    const instance = new DomainStoryContextPadProvider(
        {} as any, // elementFactory
        {} as any, // modeling
        {} as any, // replaceMenuProvider
        {} as any, // numberingRegistry
        dirtyFlagService as any,
        {} as any, // iconDictionaryService
        { allowed: () => true } as any, // rules
        {} as any, // connect
        (text: string) => text, // translate (identity)
        {} as any, // create
        {} as any, // canvas
        { registerProvider: () => undefined, isOpen: () => false } as any,
        { registerProvider: () => undefined } as any, // popupMenu
        commandStack as any,
        { on: () => undefined } as any, // eventBus
    );

    return { instance, commandStack, dirtyFlagService };
}

describe("DomainStoryContextPadProvider color change", () => {
    it("applies a picked color to a single selected element", () => {
        const { instance, commandStack, dirtyFlagService } = provider();
        const el = element("Annotation_1", ElementTypes.TEXTANNOTATION);

        instance.getContextPadEntries(el);
        document.dispatchEvent(
            new CustomEvent("pickedColor", { detail: { color: "#ff0000" } }),
        );

        expect(commandStack.execute).toHaveBeenCalledTimes(1);
        expect(commandStack.execute).toHaveBeenCalledWith(
            "element.colorChange",
            {
                businessObject: el.businessObject,
                newColor: "#ff0000",
                element: el,
            },
        );
        expect(dirtyFlagService.makeDirty).toHaveBeenCalledTimes(1);
    });

    it("applies a picked color once per element on multi-select", () => {
        const { instance, commandStack, dirtyFlagService } = provider();
        const el1 = element("Annotation_1", ElementTypes.TEXTANNOTATION);
        const el2 = element("Actor_1", ElementTypes.ACTOR);

        instance.getMultiElementContextPadEntries([el1, el2]);
        document.dispatchEvent(
            new CustomEvent("pickedColor", { detail: { color: "#00ff00" } }),
        );

        expect(commandStack.execute).toHaveBeenCalledTimes(2);
        expect(commandStack.execute).toHaveBeenNthCalledWith(
            1,
            "element.colorChange",
            {
                businessObject: el1.businessObject,
                newColor: "#00ff00",
                element: el1,
            },
        );
        expect(commandStack.execute).toHaveBeenNthCalledWith(
            2,
            "element.colorChange",
            {
                businessObject: el2.businessObject,
                newColor: "#00ff00",
                element: el2,
            },
        );
        // A single dirty flag for the whole multi-select gesture.
        expect(dirtyFlagService.makeDirty).toHaveBeenCalledTimes(1);
    });

    it("offers a colorChange entry for multi-selections", () => {
        const { instance } = provider();

        const entries = instance.getMultiElementContextPadEntries([
            element("Annotation_1", ElementTypes.TEXTANNOTATION),
            element("Actor_1", ElementTypes.ACTOR),
        ]);

        expect(entries).toHaveProperty("colorChange");
    });
});
