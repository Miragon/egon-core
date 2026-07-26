import { beforeEach, describe, expect, it } from "vitest";
import EventBus from "diagram-js/lib/core/EventBus";

import { DomainStoryRules } from "../DomainStoryRules";
import { ElementTypes } from "../../../../story/domain/elementTypes";

/**
 * Drives the rule provider through a real diagram-js EventBus (no diagram
 * bootstrap; precedent: copy-paste/__tests__/DomainStoryPasteRestore.spec.ts).
 * `RuleProvider` registers each rule on `commandStack.<action>.canExecute` and
 * `CommandInterceptor` unwraps `event.context` into the callback, so firing that
 * event with a `{ context }` payload returns exactly the rule's verdict. These
 * cases lock the two framework contracts the pure grammar can't express: the
 * in-place `newBounds` mutation and the `undefined` move tri-state.
 */

const ACTOR = { type: ElementTypes.ACTOR, id: "actor-1" };
const SECOND_ACTOR = { type: ElementTypes.ACTOR + "Person", id: "actor-2" };
const WORK_OBJECT = { type: ElementTypes.WORKOBJECT, id: "wo-1" };
const ANNOTATION = { type: ElementTypes.TEXTANNOTATION, id: "anno-1" };
const BACKGROUND = { id: "__implicitroot", type: undefined };

function group(bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
}) {
    return {
        type: ElementTypes.GROUP,
        businessObject: { type: ElementTypes.GROUP },
        ...bounds,
    };
}

describe("DomainStoryRules", () => {
    let eventBus: EventBus;

    beforeEach(() => {
        eventBus = new EventBus();
        new DomainStoryRules(eventBus);
    });

    /** Fire a modeling rule the way diagram-js's Rules service would. */
    function fireRule(action: string, context: unknown) {
        return eventBus.fire(`commandStack.${action}.canExecute`, { context });
    }

    describe("connection.create", () => {
        it("allows an actor→work object connection and types it as an activity", () => {
            expect(
                fireRule("connection.create", {
                    source: ACTOR,
                    target: WORK_OBJECT,
                }),
            ).toEqual({ type: ElementTypes.ACTIVITY });
        });

        it("types a connection onto an annotation as an annotation connection", () => {
            expect(
                fireRule("connection.create", {
                    source: ACTOR,
                    target: ANNOTATION,
                }),
            ).toEqual({ type: ElementTypes.CONNECTION });
        });

        it("denies a connection between two actors", () => {
            expect(
                fireRule("connection.create", {
                    source: ACTOR,
                    target: SECOND_ACTOR,
                }),
            ).toBe(false);
        });
    });

    describe("shape.resize", () => {
        it("mutates newBounds in place with the clamped group bounds", () => {
            const context = {
                shape: group({ x: 0, y: 0, width: 300, height: 300 }),
                newBounds: { x: 250, y: 250, width: 50, height: 50 },
            };
            const originalNewBounds = context.newBounds;

            const result = fireRule("shape.resize", context);

            expect(result).toBe(true);
            // same object reference, mutated in place (diagram-js contract)
            expect(context.newBounds).toBe(originalNewBounds);
            expect(context.newBounds).toEqual({
                x: 175,
                y: 175,
                width: 125,
                height: 125,
            });
        });

        it("denies resizing a non-group and leaves newBounds untouched", () => {
            const context = {
                shape: {
                    type: ElementTypes.WORKOBJECT,
                    businessObject: { type: ElementTypes.WORKOBJECT },
                    x: 0,
                    y: 0,
                    width: 50,
                    height: 50,
                },
                newBounds: { x: 0, y: 0, width: 10, height: 10 },
            };

            expect(fireRule("shape.resize", context)).toBe(false);
            expect(context.newBounds).toEqual({
                x: 0,
                y: 0,
                width: 10,
                height: 10,
            });
        });
    });

    describe("elements.move (tri-state)", () => {
        it("does not deny moving a non-group over empty canvas (returns undefined, not false)", () => {
            const result = fireRule("elements.move", {
                shapes: [WORK_OBJECT],
                target: undefined,
            });
            expect(result).toBeUndefined();
            expect(result).not.toBe(false);
        });

        it("allows moving a group over empty canvas", () => {
            expect(
                fireRule("elements.move", {
                    shapes: [group({ x: 0, y: 0, width: 200, height: 200 })],
                    target: undefined,
                }),
            ).toBe(true);
        });

        it("denies moving a non-group onto another ordinary shape", () => {
            expect(
                fireRule("elements.move", {
                    shapes: [WORK_OBJECT],
                    target: ACTOR,
                }),
            ).toBe(false);
        });
    });

    describe("elements.create", () => {
        it("denies a connection element with no source/target", () => {
            expect(
                fireRule("elements.create", {
                    elements: [{ type: ElementTypes.CONNECTION, id: "conn-1" }],
                    target: BACKGROUND,
                }),
            ).toBe(false);
        });

        it("allows creating an ordinary shape on the background", () => {
            expect(
                fireRule("elements.create", {
                    elements: [WORK_OBJECT],
                    target: BACKGROUND,
                }),
            ).toBe(true);
        });
    });

    describe("shape.create", () => {
        it("allows a shape on the background and denies it on an ordinary shape", () => {
            expect(
                fireRule("shape.create", {
                    shape: WORK_OBJECT,
                    target: BACKGROUND,
                }),
            ).toBe(true);
            expect(
                fireRule("shape.create", {
                    shape: WORK_OBJECT,
                    target: ACTOR,
                }),
            ).toBe(false);
        });
    });

    describe("connection.reconnect", () => {
        it("denies an annotation connection that does not land on an annotation", () => {
            expect(
                fireRule("connection.reconnect", {
                    connection: { type: ElementTypes.CONNECTION },
                    source: ACTOR,
                    target: WORK_OBJECT,
                }),
            ).toBe(false);
        });

        it("denies an activity reconnect onto an annotation", () => {
            expect(
                fireRule("connection.reconnect", {
                    connection: { type: ElementTypes.ACTIVITY },
                    source: ACTOR,
                    target: ANNOTATION,
                }),
            ).toBe(false);
        });

        // BendpointMove retries a denied reconnect with the endpoints swapped;
        // this is the orientation that retry produces.
        it("denies the swapped orientation BendpointMove retries", () => {
            expect(
                fireRule("connection.reconnect", {
                    connection: { type: ElementTypes.ACTIVITY },
                    source: ANNOTATION,
                    target: ACTOR,
                }),
            ).toBe(false);
        });

        it("re-evaluates an allowed reconnect through canConnect", () => {
            expect(
                fireRule("connection.reconnect", {
                    connection: { type: ElementTypes.ACTIVITY },
                    source: ACTOR,
                    target: WORK_OBJECT,
                }),
            ).toEqual({ type: ElementTypes.ACTIVITY });
        });
    });

    describe("connection.start", () => {
        it("denies starting from a real element", () => {
            expect(fireRule("connection.start", { source: ACTOR })).toBe(false);
        });

        it("ignores a missing source or a label", () => {
            expect(
                fireRule("connection.start", { source: undefined }),
            ).toBeNull();
            expect(
                fireRule("connection.start", {
                    source: { label: { labelTarget: WORK_OBJECT } },
                }),
            ).toBeNull();
        });
    });

    describe("connection.updateWaypoints", () => {
        it("echoes the connection type", () => {
            expect(
                fireRule("connection.updateWaypoints", {
                    connection: { type: ElementTypes.ACTIVITY },
                }),
            ).toEqual({ type: ElementTypes.ACTIVITY });
        });
    });

    describe("element.copy", () => {
        it("is always allowed (CopyPaste requires the rule to exist)", () => {
            expect(fireRule("element.copy", {})).toBe(true);
        });
    });
});
