import { afterEach, describe, expect, it } from "vitest";
import type { Connection, Shape } from "diagram-js/lib/model/Types";

import {
    createTestModeler,
    type TestModeler,
} from "../../../../__tests__/helpers/createTestModeler";
import {
    addActor,
    addAnnotation,
    addGroup,
    addWorkObject,
    connect,
} from "../../../../__tests__/helpers/storyBuilder";
import { ElementTypes } from "../../../../story/domain/elementTypes";

/**
 * The `DomainStoryUpdateHandler` handlers through the real commandStack: their
 * `revert()` is the only undo for writes on live elements, so only a real graph
 * proves undo leaves the model exportable.
 *
 * Browser tier (ADR TST-2): `canvas.addShape` reaches
 * `SVGSVGElement.createSVGTransform`, which jsdom does not implement.
 */
describe("update-handler commands (browser)", () => {
    let modeler: TestModeler | undefined;

    afterEach(() => {
        modeler?.cleanup();
        modeler = undefined;
    });

    /** Mirrors DomainStoryContextPadProvider.getColorChangeDescription. */
    function changeColor(element: Shape | Connection, newColor: string) {
        modeler!.commandStack.execute("element.colorChange", {
            businessObject: element.businessObject,
            newColor,
            element,
        });
    }

    describe("element.colorChange", () => {
        it("restores an absent colour to undefined, not to a default", () => {
            modeler = createTestModeler();
            const actor = addActor(modeler, { name: "Alice" });
            expect(actor.businessObject.pickedColor).toBeUndefined();

            changeColor(actor, "#ff0000");

            expect(actor.businessObject.pickedColor).toBe("#ff0000");

            modeler.commandStack.undo();

            // A falsy guard on the `undefined` snapshot would keep the red.
            expect(actor.businessObject.pickedColor).toBeUndefined();
        });

        it("restores the previous colour on undo and reapplies it on redo", () => {
            modeler = createTestModeler();
            const workObject = addWorkObject(modeler, {
                pickedColor: "#00ff00",
            });

            changeColor(workObject, "#0000ff");
            expect(workObject.businessObject.pickedColor).toBe("#0000ff");

            modeler.commandStack.undo();
            expect(workObject.businessObject.pickedColor).toBe("#00ff00");

            modeler.commandStack.redo();
            expect(workObject.businessObject.pickedColor).toBe("#0000ff");
        });

        const connectedAnnotationCases = [
            {
                name: "different annotation and connection colours",
                annotationColor: "#111111",
                connectionColor: "#222222",
            },
            {
                name: "an annotation colour that was undefined",
                annotationColor: undefined,
                connectionColor: "#222222",
            },
            {
                name: "a connection colour that was undefined",
                annotationColor: "#111111",
                connectionColor: undefined,
            },
        ];

        for (const {
            name,
            annotationColor,
            connectionColor,
        } of connectedAnnotationCases) {
            it(`independently restores ${name} through repeated undo`, () => {
                modeler = createTestModeler();
                const workObject = addWorkObject(modeler, {
                    point: { x: 200, y: 200 },
                });
                const annotation = addAnnotation(modeler, {
                    point: { x: 500, y: 200 },
                    pickedColor: annotationColor,
                });
                // An annotation target gets a CONNECTION, not an ACTIVITY.
                const connection = connect(
                    modeler,
                    workObject,
                    annotation,
                    ElementTypes.CONNECTION,
                )!;
                connection.businessObject.pickedColor = connectionColor;
                expect(annotation.incoming[0]).toBe(connection);

                changeColor(annotation, "#123456");
                expect(annotation.businessObject.pickedColor).toBe("#123456");
                expect(connection.businessObject.pickedColor).toBe("#123456");

                modeler.commandStack.undo();
                expect(annotation.businessObject.pickedColor).toBe(
                    annotationColor,
                );
                expect(connection.businessObject.pickedColor).toBe(
                    connectionColor,
                );

                modeler.commandStack.redo();
                expect(annotation.businessObject.pickedColor).toBe("#123456");
                expect(connection.businessObject.pickedColor).toBe("#123456");

                modeler.commandStack.undo();
                expect(annotation.businessObject.pickedColor).toBe(
                    annotationColor,
                );
                expect(connection.businessObject.pickedColor).toBe(
                    connectionColor,
                );
            });
        }

        it("recolours and restores an annotation without a connection", () => {
            modeler = createTestModeler();
            const annotation = addAnnotation(modeler, {
                pickedColor: "#111111",
            });

            changeColor(annotation, "#123456");
            expect(annotation.businessObject.pickedColor).toBe("#123456");

            modeler.commandStack.undo();
            expect(annotation.businessObject.pickedColor).toBe("#111111");

            modeler.commandStack.redo();
            expect(annotation.businessObject.pickedColor).toBe("#123456");

            modeler.commandStack.undo();
            expect(annotation.businessObject.pickedColor).toBe("#111111");
        });
    });

    describe("activity.directionChange", () => {
        /** Mirrors DomainStoryContextPadProvider.changeDirection. */
        function changeDirection(
            activity: Connection,
            newNumber: number | null,
        ) {
            modeler!.commandStack.execute("activity.directionChange", {
                businessObject: activity.businessObject,
                newNumber,
                element: activity,
            });
        }

        it("swaps both ends, reverses the waypoints and drops the number", () => {
            modeler = createTestModeler();
            const actor = addActor(modeler, { point: { x: 150, y: 200 } });
            const workObject = addWorkObject(modeler, {
                point: { x: 550, y: 200 },
            });
            const activity = connect(modeler, actor, workObject)!;
            const waypointsBefore = activity.waypoints.map((point) => ({
                x: point.x,
                y: point.y,
            }));
            // Minted by the `connection.create` interceptor (ADR ARC-4).
            expect(activity.businessObject.number).toBe(1);

            // After the swap the source is a work object, so no number.
            changeDirection(activity, null);

            expect(activity.source).toBe(workObject);
            expect(activity.target).toBe(actor);
            // The export reads these ids, not the live element references.
            expect(activity.businessObject.source).toBe(workObject.id);
            expect(activity.businessObject.target).toBe(actor.id);
            expect(
                activity.waypoints.map((point) => ({
                    x: point.x,
                    y: point.y,
                })),
            ).toEqual([...waypointsBefore].reverse());
            // `null`, never `0`, so the export writes `"number": null`.
            expect(activity.businessObject.number).toBeNull();
        });

        it("applies the new number when the swap makes an actor the source", () => {
            modeler = createTestModeler();
            const actor = addActor(modeler, { point: { x: 150, y: 200 } });
            const workObject = addWorkObject(modeler, {
                point: { x: 550, y: 200 },
            });
            const activity = connect(modeler, workObject, actor)!;
            expect(activity.businessObject.number).toBeNull();

            changeDirection(activity, 7);

            expect(activity.source).toBe(actor);
            expect(activity.businessObject.source).toBe(actor.id);
            expect(activity.businessObject.number).toBe(7);
        });

        it("undo restores ends, waypoints, name and number together", () => {
            modeler = createTestModeler();
            const actor = addActor(modeler, { point: { x: 150, y: 200 } });
            const workObject = addWorkObject(modeler, {
                point: { x: 550, y: 200 },
            });
            const activity = connect(modeler, actor, workObject)!;
            modeler.modeling.updateLabel(activity, "orders");
            const waypointsBefore = activity.waypoints.map((point) => ({
                x: point.x,
                y: point.y,
            }));
            // Read after the rename: renaming must not touch the number.
            const numberBefore = activity.businessObject.number;
            expect(numberBefore).toBe(1);

            changeDirection(activity, null);
            modeler.commandStack.undo();

            expect(activity.source).toBe(actor);
            expect(activity.target).toBe(workObject);
            expect(activity.businessObject.source).toBe(actor.id);
            expect(activity.businessObject.target).toBe(workObject.id);
            expect(
                activity.waypoints.map((point) => ({
                    x: point.x,
                    y: point.y,
                })),
            ).toEqual(waypointsBefore);
            expect(activity.businessObject.number).toBe(numberBefore);
            expect(activity.businessObject.name).toBe("orders");
        });
    });

    describe("shape.removeGroupWithoutChildren", () => {
        it("lifts the children back onto the canvas root", () => {
            modeler = createTestModeler();
            const group = addGroup(modeler, { point: { x: 400, y: 300 } });
            const actor = addActor(modeler, { point: { x: 400, y: 300 } });
            modeler.modeling.moveElements([actor], { x: 0, y: 0 }, group);
            expect(actor.parent).toBe(group);

            modeler.commandStack.execute("shape.removeGroupWithoutChildren", {
                element: group,
            });

            expect(actor.parent).toBe(modeler.root);
            expect(modeler.elementRegistry.get(actor.id)).toBe(actor);
            expect(group.children).not.toContain(actor);
            // A stale `parent: <deletedGroupId>` would survive into the export.
            expect(actor.businessObject.parent).toBeUndefined();
        });

        it("keeps the children when the whole removeGroup flow runs", () => {
            modeler = createTestModeler();
            const group = addGroup(modeler, { point: { x: 400, y: 300 } });
            const actor = addActor(modeler, { point: { x: 400, y: 300 } });
            const workObject = addWorkObject(modeler, {
                point: { x: 460, y: 340 },
            });
            modeler.modeling.moveElements(
                [actor, workObject],
                { x: 0, y: 0 },
                group,
            );

            // What the context pad calls; nested commands share one action id,
            // so a single undo must restore everything.
            modeler.modeling.removeGroup(group);

            expect(modeler.elementRegistry.get(group.id)).toBeUndefined();
            expect(modeler.elementRegistry.get(actor.id)).toBe(actor);
            expect(modeler.elementRegistry.get(workObject.id)).toBe(workObject);
            expect(actor.parent).toBe(modeler.root);
            expect(workObject.parent).toBe(modeler.root);

            modeler.commandStack.undo();

            expect(modeler.elementRegistry.get(group.id)).toBe(group);
            expect(actor.parent).toBe(group);
            expect(workObject.parent).toBe(group);
            expect(group.children).toContain(actor);
            expect(group.children).toContain(workObject);
        });

        /** Otherwise the next export drops containment the user never removed. */
        it("undo re-adopts the children into the restored group", () => {
            modeler = createTestModeler();
            const group = addGroup(modeler, { point: { x: 400, y: 300 } });
            const actor = addActor(modeler, { point: { x: 400, y: 300 } });
            modeler.modeling.moveElements([actor], { x: 0, y: 0 }, group);

            modeler.commandStack.execute("shape.removeGroupWithoutChildren", {
                element: group,
            });

            modeler.commandStack.undo();

            expect(actor.parent).toBe(group);
            expect(group.children).toContain(actor);
            // The export reads this field, not the live parent reference.
            expect(actor.businessObject.parent).toBe(group.id);
        });

        it("keeps an activity's bendpoints when its source is lifted out", () => {
            modeler = createTestModeler();
            const group = addGroup(modeler, { point: { x: 400, y: 300 } });
            const actor = addActor(modeler, { point: { x: 400, y: 300 } });
            const workObject = addWorkObject(modeler, {
                point: { x: 900, y: 300 },
            });
            modeler.modeling.moveElements([actor], { x: 0, y: 0 }, group);
            const activity = connect(modeler, actor, workObject)!;
            // With one endpoint moving, `BaseLayouter` would re-layout the
            // activity to two points; the handler passes `layout: false`.
            modeler.modeling.updateWaypoints(activity, [
                { x: activity.waypoints[0].x, y: activity.waypoints[0].y },
                { x: 650, y: 500 },
                {
                    x: activity.waypoints[activity.waypoints.length - 1].x,
                    y: activity.waypoints[activity.waypoints.length - 1].y,
                },
            ]);
            const waypointsBefore = activity.waypoints.map((point) => ({
                x: point.x,
                y: point.y,
            }));
            expect(waypointsBefore).toHaveLength(3);

            modeler.modeling.removeGroup(group);

            expect(
                activity.waypoints.map((point) => ({
                    x: point.x,
                    y: point.y,
                })),
            ).toEqual(waypointsBefore);
            expect(
                activity.businessObject.waypoints.map(
                    (point: { x: number; y: number }) => ({
                        x: point.x,
                        y: point.y,
                    }),
                ),
            ).toEqual(waypointsBefore);
        });

        it("keeps an activity that is parented to the group being removed", () => {
            modeler = createTestModeler();
            const group = addGroup(modeler, { point: { x: 400, y: 300 } });
            const actor = addActor(modeler, { point: { x: 400, y: 300 } });
            const workObject = addWorkObject(modeler, {
                point: { x: 900, y: 300 },
            });
            modeler.modeling.moveElements([actor], { x: 0, y: 0 }, group);
            const activity = connect(modeler, actor, workObject)!;

            // `Modeling.connect` parents a connection to `source.parent`, and
            // `DeleteShapeHandler.preExecute` deletes children.
            expect(activity.parent).toBe(group);

            modeler.modeling.removeGroup(group);

            expect(modeler.elementRegistry.get(activity.id)).toBe(activity);
            expect(activity.parent).toBe(modeler.root);
        });

        /** `recurse: false` keeps `MoveShapeHandler` out of the child group. */
        it("lifts out a child group with its own contents intact", () => {
            modeler = createTestModeler();
            const actor = addActor(modeler, { point: { x: 400, y: 300 } });
            const childGroup = addGroup(modeler, {
                point: { x: 400, y: 300 },
                width: 120,
                height: 100,
            });
            const group = addGroup(modeler, { point: { x: 400, y: 300 } });
            expect(childGroup.children).toContain(actor);
            expect(group.children).toContain(childGroup);

            modeler.modeling.removeGroup(group);

            expect(modeler.elementRegistry.get(group.id)).toBeUndefined();
            expect(childGroup.parent).toBe(modeler.root);
            expect(actor.parent).toBe(childGroup);
        });

        it("does not adopt a root shape into the child group it uncovers", () => {
            modeler = createTestModeler();
            const group = addGroup(modeler, { point: { x: 400, y: 300 } });
            const childGroup = addGroup(modeler, {
                point: { x: 400, y: 300 },
                width: 120,
                height: 100,
            });
            // A new group only adopts what it is drawn over; the nudge makes the
            // outer group take in the inner one.
            modeler.modeling.moveElements([group], { x: 0, y: 0 });
            expect(childGroup.parent).toBe(group);

            // Inside the child group's box, but creating a shape does not adopt it.
            const actor = addActor(modeler, { point: { x: 400, y: 300 } });
            expect(actor.parent).toBe(modeler.root);

            modeler.modeling.removeGroup(group);

            // Without `groupTeardown` the child group's move would adopt the actor.
            expect(actor.parent).toBe(modeler.root);
            expect(childGroup.children).not.toContain(actor);

            modeler.commandStack.undo();

            expect(childGroup.parent).toBe(group);
        });
    });
});
