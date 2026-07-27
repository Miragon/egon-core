import { beforeEach, describe, expect, it } from "vitest";
import EventBus from "diagram-js/lib/core/EventBus";

import { DomainStoryCopyPaste } from "../DomainStoryCopyPaste";
import { DomainStoryPropertyCopy } from "../DomainStoryPropertyCopy";
import { ElementTypes } from "../../../../story/domain/elementTypes";

/**
 * Issue #74: a pasted element must carry its `type` before anything paints it.
 *
 * Paste is the one path that mints a business object without one —
 * `copyElement` is called with no `propertyNames`, so it copies nothing. Every
 * other path already stamps it (the file carries it on import;
 * `DomainStoryElementFactory.create` sets it for palette create, context-pad
 * append and `shape.replace`). Until #74 the *renderer* patched it in while
 * drawing, which meant an unrendered paste had an untyped business object and
 * exported one too.
 *
 * Synthetic events on a real `EventBus`, the precedent of
 * `DomainStoryPasteRestore.spec.ts`: the two listeners under test are the whole
 * mechanism and neither needs a canvas.
 */
describe("DomainStoryCopyPaste", () => {
    let eventBus: EventBus;

    beforeEach(() => {
        eventBus = new EventBus();
        new DomainStoryCopyPaste(
            new DomainStoryPropertyCopy(eventBus),
            eventBus,
        );
    });

    /** Drives copy then paste for one element, and hands back its descriptor. */
    function copyThenPaste(element: {
        type: string;
        businessObject: Record<string, unknown>;
    }): any {
        const descriptor: any = {};
        eventBus.fire("copyPaste.copyElement", { descriptor, element });
        eventBus.fire("copyPaste.pasteElements", {});
        eventBus.fire("copyPaste.pasteElement", { cache: {}, descriptor });
        return descriptor;
    }

    it("carries the copied type onto the pasted business object", () => {
        const type = ElementTypes.ACTOR + "Person";

        const descriptor = copyThenPaste({
            type,
            businessObject: { id: "shape_1", type, name: "Alice" },
        });

        // The type, on the business object, with no render having happened.
        expect(descriptor.businessObject.type).toBe(type);
        expect(descriptor.businessObject.name).toBe("Alice");
    });

    it("carries an activity's type, the case the renderer used to patch", () => {
        // `drawConnection`'s "fixes activities that were copy-pasted" comment
        // named this one specifically.
        const descriptor = copyThenPaste({
            type: ElementTypes.ACTIVITY,
            businessObject: { id: "connection_1", type: ElementTypes.ACTIVITY },
        });

        expect(descriptor.businessObject.type).toBe(ElementTypes.ACTIVITY);
    });

    it("copies name and type, and nothing else", () => {
        // The narrow surface is deliberate — a pasted element is a *new* element
        // and must not inherit the original's id, number or geometry. `type`
        // joining `name` in #74 is the whole widening; anything more here would
        // be a regression, not a feature.
        const type = ElementTypes.ACTIVITY;

        const descriptor = copyThenPaste({
            type,
            businessObject: {
                id: "connection_1",
                type,
                number: 7,
                name: "orders",
            },
        });

        expect(Object.keys(descriptor.businessObject).sort()).toEqual([
            "name",
            "type",
        ]);
    });
});
