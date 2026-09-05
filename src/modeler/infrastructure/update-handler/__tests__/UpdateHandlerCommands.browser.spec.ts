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
 * The command-handler half of issue #55: the four handlers
 * `DomainStoryUpdateHandler` registers, driven through the real commandStack.
 *
 * WHY this is not a mock-based spec: these handlers write straight onto live
 * `businessObject`s and onto diagram-js' own `source`/`target`/`waypoints`
 * fields, and their `revert()` is the *only* thing that undoes those writes —
 * there is no framework-level snapshot behind them. A stubbed context proves the
 * handler's arithmetic; only a real graph proves that undo actually leaves the
 * model exportable again. That is exactly what an upstream sync breaks silently.
 *
 * WHY browser tier (ADR 0014): every case here needs shapes on the canvas, and
 * `canvas.addShape` reaches tiny-svg `translate()` →
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

            // The interesting case: `preExecute` snapshots `undefined`, so revert
            // must write `undefined` back. A handler that guarded the snapshot
            // with a falsy check would leave the red behind forever.
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
                // The grammar answers CONNECTION (not ACTIVITY) for an
                // annotation target, so this is the edge the handler couples.
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
            // Minted by the `connection.create` interceptor since #74; it used
            // to take a real draw pass (ADR 0014, blocker 2 — now stale).
            expect(activity.businessObject.number).toBe(1);

            // `null` is what the context pad passes when the *current* source is
            // an actor: after the swap the activity starts at the work object,
            // and only actor-initiated activities carry a number. It used to
            // pass `0` and rely on the repaint to launder that into `null`.
            changeDirection(activity, null);

            expect(activity.source).toBe(workObject);
            expect(activity.target).toBe(actor);
            // The business object mirrors the ends *by id*; the export reads
            // these, not the live element references.
            expect(activity.businessObject.source).toBe(workObject.id);
            expect(activity.businessObject.target).toBe(actor.id);
            expect(
                activity.waypoints.map((point) => ({
                    x: point.x,
                    y: point.y,
                })),
            ).toEqual([...waypointsBefore].reverse());
            // The command itself nulls the number now, so the badge disappears
            // with the swap whether or not anything repaints — and the exported
            // bytes say `null`, never `0`.
            expect(activity.businessObject.number).toBeNull();
        });

        it("applies the new number when the swap makes an actor the source", () => {
            modeler = createTestModeler();
            const actor = addActor(modeler, { point: { x: 150, y: 200 } });
            const workObject = addWorkObject(modeler, {
                point: { x: 550, y: 200 },
            });
            // The mirror image of the case above: a work-object-initiated
            // activity has no number until the swap gives it an actor source.
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
            // Read *after* the rename on purpose: until #74 `element.updateLabel`
            // blanked an activity's number and only the following repaint put it
            // back, so a renamed activity briefly had none. The label handler is
            // label-only now (#84), so this is still 1.
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
            // A direction change never touches the name. It used to carry one
            // through `context.name`, purely to undo the blanking its own nested
            // `updateNumber` caused; both are gone (#84), so the name simply
            // survives the swap and its undo untouched.
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

            // The whole point of the command: the group's frame goes away but
            // its contents must survive, reparented to the group's own parent.
            expect(actor.parent).toBe(modeler.root);
            expect(modeler.elementRegistry.get(actor.id)).toBe(actor);
            expect(group.children).not.toContain(actor);
            // …and the persisted containment goes with it: a stale
            // `parent: <deletedGroupId>` would survive into the exported file.
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

            // `removeGroup` is what the context pad calls. The teardown runs
            // entirely in the command's `preExecute`, and nested commands
            // inherit the outer action id — so it is *one* commandStack entry,
            // and one Ctrl+Z has to put the whole thing back.
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

        /**
         * Undo must be a true inverse: the children were the group's before the
         * command ran, so they must be the group's again afterwards — otherwise
         * the next export drops containment the user never removed.
         *
         * This case is the direct regression lock for issue #67. The old
         * hand-rolled handler failed it twice over: `revert` fired `shape.added`
         * with no `gfx` (diagram-js' `InteractionEvents` dereferences it → a
         * `TypeError` that escaped `commandStack.undo()`), and its body iterated
         * `element.children`, which `execute` had already emptied. Both are gone
         * because the handler no longer writes its own inverse: the teardown is
         * nested modeling calls in `preExecute`, so diagram-js' own
         * `MoveShapeHandler.revert` / `DeleteShapeHandler.revert` undo it.
         */
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
            // The business object mirrors the containment; the export reads
            // this field, not the live parent reference.
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
            // A bendpoint is what makes this case bite: only one endpoint moves,
            // so `MoveHelper.moveClosure` would route through
            // `modeling.layoutConnection` → `BaseLayouter`, which returns exactly
            // two points. That is why the handler moves each child itself with
            // `layout: false` instead of calling `modeling.moveElements`.
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
            // …and nothing flattened got written into the persisted model.
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

            // The precondition this case exists for: `Modeling.connect` parents
            // a connection to `source.parent`, so drawing from inside the group
            // makes the activity a *child* of the group — and
            // `DeleteShapeHandler.preExecute` deletes children.
            expect(activity.parent).toBe(group);

            modeler.modeling.removeGroup(group);

            expect(modeler.elementRegistry.get(activity.id)).toBe(activity);
            expect(activity.parent).toBe(modeler.root);
        });

        /**
         * A group inside the group being torn down is the recursive case: it
         * must be lifted out *with its own children still attached*, not
         * flattened onto the root. `recurse: false` on the move is what keeps
         * `MoveShapeHandler` from walking into it.
         */
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
            // A newly drawn group only adopts what it is drawn *over*, so the
            // outer group has to be nudged before it takes the inner one in.
            modeler.modeling.moveElements([group], { x: 0, y: 0 });
            expect(childGroup.parent).toBe(group);

            // Sits inside the child group's box but belongs to the canvas root:
            // creating a plain shape over a group does not adopt it.
            const actor = addActor(modeler, { point: { x: 400, y: 300 } });
            expect(actor.parent).toBe(modeler.root);

            modeler.modeling.removeGroup(group);

            // Without the `groupTeardown` hint the child group's move would run
            // `reworkGroupElements`, which rewrites parent/children outside the
            // command stack — so the actor would be swallowed by a group it was
            // never in, and no undo could give it back.
            expect(actor.parent).toBe(modeler.root);
            expect(childGroup.children).not.toContain(actor);

            modeler.commandStack.undo();

            expect(childGroup.parent).toBe(group);
        });
    });
});
