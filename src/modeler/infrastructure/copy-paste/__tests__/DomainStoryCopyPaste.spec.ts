import { beforeEach, describe, expect, it } from "vitest";
import EventBus from "diagram-js/lib/core/EventBus";

import { DomainStoryCopyPaste } from "../DomainStoryCopyPaste";
import { DomainStoryPropertyCopy } from "../DomainStoryPropertyCopy";
import { ElementTypes } from "../../../../story/domain/elementTypes";

/**
 * A pasted element must carry its `type` before anything paints it (ADR ARC-4).
 * Synthetic events on a real `EventBus`: the two listeners under test are the
 * whole mechanism and neither needs a canvas.
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

        expect(descriptor.businessObject.type).toBe(type);
        expect(descriptor.businessObject.name).toBe("Alice");
    });

    it("carries an activity's type, the case the renderer used to patch", () => {
        const descriptor = copyThenPaste({
            type: ElementTypes.ACTIVITY,
            businessObject: { id: "connection_1", type: ElementTypes.ACTIVITY },
        });

        expect(descriptor.businessObject.type).toBe(ElementTypes.ACTIVITY);
    });

    it("copies name and type, and nothing else", () => {
        // A pasted element is new and must not inherit id, number or geometry.
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
