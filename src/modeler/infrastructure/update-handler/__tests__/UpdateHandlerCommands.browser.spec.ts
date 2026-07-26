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

        it("recolours an annotation's incoming connection with it, and undoes both", () => {
            modeler = createTestModeler();
            const workObject = addWorkObject(modeler, {
                point: { x: 200, y: 200 },
            });
            const annotation = addAnnotation(modeler, {
                point: { x: 500, y: 200 },
            });
            // The grammar answers CONNECTION (not ACTIVITY) for an annotation
            // target, so this is the edge the handler is written for.
            const connection = connect(
                modeler,
                workObject,
                annotation,
                ElementTypes.CONNECTION,
            )!;
            expect(annotation.incoming[0]).toBe(connection);

            changeColor(annotation, "#123456");

            // WHY the handler special-cases annotations: an annotation and its
            // dashed connector read as one glyph, so recolouring one without the
            // other looks like a rendering bug.
            expect(annotation.businessObject.pickedColor).toBe("#123456");
            expect(connection.businessObject.pickedColor).toBe("#123456");

            modeler.commandStack.undo();

            expect(annotation.businessObject.pickedColor).toBeUndefined();
            expect(connection.businessObject.pickedColor).toBeUndefined();
        });
    });

    describe("activity.directionChange", () => {
        /** Mirrors DomainStoryContextPadProvider.changeDirection. */
        function changeDirection(activity: Connection, newNumber: number) {
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
            // Auto-numbering runs in the renderer, so this is only non-null
            // because a real draw pass happened — see ADR 0014, blocker 2.
            expect(activity.businessObject.number).toBe(1);

            // 0 is what the context pad passes when the *current* source is an
            // actor: after the swap the activity starts at the work object, and
            // only actor-initiated activities carry a number.
            changeDirection(activity, 0);

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
            // `renderExternalNumber` nulls the number of any activity whose
            // source is not an actor, so the badge disappears with the swap.
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
            const numberBefore = activity.businessObject.number;

            changeDirection(activity, 0);
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
            // The handler carries the name through `context.name` because
            // `updateNumber` in preExecute runs the label handler, which would
            // otherwise blank it — the restore has to put it back.
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

            // `removeGroup` is what the context pad calls: the custom command
            // detaches the children, then a plain `elements.delete` removes the
            // now-empty group. Two commandStack entries, so two undos.
            modeler.modeling.removeGroup(group);

            expect(modeler.elementRegistry.get(group.id)).toBeUndefined();
            expect(modeler.elementRegistry.get(actor.id)).toBe(actor);
            expect(modeler.elementRegistry.get(workObject.id)).toBe(workObject);
            expect(actor.parent).toBe(modeler.root);
            expect(workObject.parent).toBe(modeler.root);

            modeler.commandStack.undo();

            expect(modeler.elementRegistry.get(group.id)).toBe(group);
        });

        /**
         * KNOWN BUG, shared with upstream — pinned rather than asserted-correct.
         *
         * Undo of this command should be a true inverse: the children were the
         * group's before it ran, so they must be the group's again afterwards or
         * the next export loses containment the user never removed. It is not.
         * Two defects stack up in `RemoveGroupWithoutChildrenHandler.revert`:
         *
         * 1. it fires `shape.added` with no `gfx`, and diagram-js'
         *    `InteractionEvents` listener dereferences `event.gfx` → the
         *    `appendChild` TypeError below, which escapes `commandStack.undo()`;
         * 2. even with that fixed the body is a no-op, because it iterates
         *    `context.element.children` — which `execute` has already emptied
         *    via `undoGroupRework` — instead of the `context.children` snapshot
         *    `preExecute` took for exactly this purpose.
         *
         * Reachable from the UI: context pad → "Remove Group without
         * Child-Elements" → Ctrl+Z twice (the first undo unwinds the
         * `elements.delete` that `modeling.removeGroup` issues; the second
         * throws).
         *
         * Recorded in SYNC.md under "Known, still shared with upstream" and
         * pinned here the way `FormatCompatibilityMatrix.browser.spec.ts` pins
         * its known deviations: a fix on either side turns this case red instead
         * of passing silently. Fixing it means fixing this spec — invert the
         * assertions to the two commented-out expectations.
         */
        it("undo of the custom command throws and re-adopts nothing (known bug)", () => {
            modeler = createTestModeler();
            const group = addGroup(modeler, { point: { x: 400, y: 300 } });
            const actor = addActor(modeler, { point: { x: 400, y: 300 } });
            modeler.modeling.moveElements([actor], { x: 0, y: 0 }, group);

            modeler.commandStack.execute("shape.removeGroupWithoutChildren", {
                element: group,
            });

            expect(() => modeler!.commandStack.undo()).toThrow(
                /Cannot read properties of undefined \(reading 'appendChild'\)/,
            );

            // What it *should* be, once fixed:
            //   expect(actor.parent).toBe(group);
            //   expect(group.children).toContain(actor);
            expect(actor.parent).toBe(modeler.root);
            expect(group.children).not.toContain(actor);
        });
    });
});
