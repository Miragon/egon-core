import { afterEach, describe, expect, it } from "vitest";

import {
    createTestModeler,
    type TestModeler,
} from "../../../__tests__/helpers/createTestModeler";
import {
    addActor,
    addAnnotation,
    addGroup,
    addWorkObject,
    connect,
} from "../../../__tests__/helpers/storyBuilder";
import { ElementTypes } from "../../../story/domain/elementTypes";

/**
 * The create/move/delete/resize half of issue #55: modeling commands driven
 * through a real commandStack, asserting business-object state and undo/redo.
 *
 * WHY this is not a mock-based spec: every existing modeling spec stubs the
 * collaborators, so none of them proves the *wiring* — that `DomainStoryUpdater`
 * actually writes `x`/`y` back onto the business object, that its
 * `reverted(["shape.move"])` branch restores them, or that deleting a shape
 * takes its connections with it. Those are the exact seams an upstream sync
 * breaks silently.
 *
 * WHY browser tier and not jsdom (ADR 0014): `canvas.addShape` reaches tiny-svg
 * `translate()` → `SVGSVGElement.createSVGTransform`, which jsdom does not
 * implement, so no modeling command can execute there at all.
 */
describe("modeling commands (browser)", () => {
    let modeler: TestModeler | undefined;

    afterEach(() => {
        modeler?.cleanup();
        modeler = undefined;
    });

    describe("shape.create", () => {
        it("registers an actor with the default size and a typed id", () => {
            modeler = createTestModeler();

            const actor = addActor(modeler, { name: "Alice" });

            expect(modeler.elementRegistry.get(actor.id)).toBe(actor);
            // The id is keyed on the *factory* type, not the element type:
            // DomainStoryElementFactory calls `idFactory.getId(type)` with
            // diagram-js' "shape"/"connection"/"root", so an actor is
            // `shape_1234`, not `domainStory:actorPerson_1234`.
            expect(actor.id).toMatch(/^shape_\d{4}$/);
            expect({ width: actor.width, height: actor.height }).toEqual({
                width: 75,
                height: 75,
            });
        });

        it("gives a work object, annotation and group their own defaults", () => {
            modeler = createTestModeler();

            const workObject = addWorkObject(modeler, {
                point: { x: 200, y: 200 },
            });
            const annotation = addAnnotation(modeler, {
                point: { x: 500, y: 200 },
            });
            const group = addGroup(modeler, { point: { x: 500, y: 450 } });

            expect({
                width: workObject.width,
                height: workObject.height,
            }).toEqual({ width: 75, height: 75 });
            expect({
                width: annotation.width,
                height: annotation.height,
            }).toEqual({ width: 100, height: 30 });
            expect({ width: group.width, height: group.height }).toEqual({
                width: 300,
                height: 200,
            });
        });

        it("has DomainStoryUpdater write the coordinates onto the businessObject", () => {
            modeler = createTestModeler();

            // diagram-js centres the shape on the requested point:
            // CreateShapeHandler computes `x = position.x - round(width / 2)`,
            // so a 75×75 actor asked for at (200, 200) lands at 200 - 38 = 162.
            const actor = addActor(modeler, { point: { x: 200, y: 200 } });

            expect(actor.x).toBe(200 - Math.round(75 / 2));
            expect(actor.y).toBe(200 - Math.round(75 / 2));
            expect(actor.businessObject.x).toBe(actor.x);
            expect(actor.businessObject.y).toBe(actor.y);
        });

        it("undo removes it from registry and DOM; redo restores the same id", () => {
            modeler = createTestModeler();
            const actor = addActor(modeler);
            const id = actor.id;

            modeler.commandStack.undo();

            expect(modeler.elementRegistry.get(id)).toBeUndefined();
            expect(
                modeler.container.querySelector(`[data-element-id="${id}"]`),
            ).toBeNull();

            modeler.commandStack.redo();

            expect(modeler.elementRegistry.get(id)).toBeDefined();
            expect(
                modeler.container.querySelector(`[data-element-id="${id}"]`),
            ).not.toBeNull();
        });
    });

    describe("shape.move", () => {
        it("moves element and businessObject together, and undo restores both", () => {
            modeler = createTestModeler();
            const actor = addActor(modeler, { point: { x: 200, y: 200 } });
            const originalX = actor.x;
            const originalY = actor.y;

            modeler.modeling.moveElements([actor], { x: 60, y: 40 });

            expect(actor.x).toBe(originalX + 60);
            expect(actor.y).toBe(originalY + 40);
            expect(actor.businessObject.x).toBe(actor.x);
            expect(actor.businessObject.y).toBe(actor.y);

            // The `reverted(["shape.move"])` branch of DomainStoryUpdater: without
            // it the element snaps back but the business object keeps the moved
            // coordinates, so the next export writes the wrong position.
            modeler.commandStack.undo();

            expect(actor.x).toBe(originalX);
            expect(actor.y).toBe(originalY);
            expect(actor.businessObject.x).toBe(originalX);
            expect(actor.businessObject.y).toBe(originalY);
        });
    });

    describe("shape.resize", () => {
        it("updates a group's businessObject size and undo restores it", () => {
            modeler = createTestModeler();
            const group = addGroup(modeler, { point: { x: 400, y: 300 } });

            modeler.modeling.resizeShape(group, {
                x: group.x,
                y: group.y,
                width: 400,
                height: 260,
            });

            // Only groups are resizable, and only for groups does
            // DomainStoryUpdater copy width/height back onto the business object.
            expect(group.businessObject.width).toBe(400);
            expect(group.businessObject.height).toBe(260);

            modeler.commandStack.undo();

            expect(group.width).toBe(300);
            expect(group.businessObject.width).toBe(300);
            expect(group.businessObject.height).toBe(200);
        });
    });

    describe("shape.delete", () => {
        it("takes the attached activities with it, and undo restores waypoints", () => {
            modeler = createTestModeler();
            const actor = addActor(modeler, { point: { x: 150, y: 200 } });
            const workObject = addWorkObject(modeler, {
                point: { x: 450, y: 200 },
            });
            const activity = connect(modeler, actor, workObject)!;
            const waypointsBefore = activity.waypoints.map((point) => ({
                x: point.x,
                y: point.y,
            }));

            modeler.modeling.removeShape(workObject);

            expect(modeler.elementRegistry.get(workObject.id)).toBeUndefined();
            expect(modeler.elementRegistry.get(activity.id)).toBeUndefined();
            expect(actor.outgoing).toHaveLength(0);

            modeler.commandStack.undo();

            expect(modeler.elementRegistry.get(workObject.id)).toBeDefined();
            const restored = modeler.elementRegistry.get(activity.id) as any;
            expect(restored).toBeDefined();
            expect(
                restored.waypoints.map((point: any) => ({
                    x: point.x,
                    y: point.y,
                })),
            ).toEqual(waypointsBefore);
            // …and the endpoints the updater mirrors onto the business object.
            expect(restored.businessObject.source).toBe(actor.id);
            expect(restored.businessObject.target).toBe(workObject.id);
        });
    });

    describe("groups", () => {
        it("records the group as parent on a shape moved into it", () => {
            modeler = createTestModeler();
            const group = addGroup(modeler, { point: { x: 400, y: 300 } });
            const actor = addActor(modeler, { point: { x: 150, y: 150 } });

            modeler.modeling.moveElements([actor], { x: 0, y: 0 }, group);

            expect(actor.parent).toBe(group);
            expect(actor.businessObject.parent).toBe(group.id);
        });

        it("adopts the shapes a newly created group is dropped over", () => {
            modeler = createTestModeler();
            const actor = addActor(modeler, { point: { x: 400, y: 300 } });

            // reworkGroupElements: a group created over existing shapes takes
            // them as children so the story exports the containment.
            const group = addGroup(modeler, { point: { x: 400, y: 300 } });

            expect(group.children).toContain(actor);
            expect(actor.parent).toBe(group);
        });

        it("moves a shape back out of a group", () => {
            modeler = createTestModeler();
            const group = addGroup(modeler, { point: { x: 400, y: 300 } });
            // Creating a plain shape over a group does *not* adopt it — only
            // reworkGroupElements does, and that runs when the *group* is the
            // shape being created or moved. So move it in explicitly first.
            const actor = addActor(modeler, { point: { x: 400, y: 300 } });
            modeler.modeling.moveElements([actor], { x: 0, y: 0 }, group);
            expect(actor.parent).toBe(group);

            modeler.modeling.moveElements(
                [actor],
                { x: 0, y: 0 },
                modeler.root as any,
            );

            expect(actor.parent).toBe(modeler.root);
        });
    });

    describe("history", () => {
        it("counts one commandStack entry per modeling call", () => {
            modeler = createTestModeler();
            const actor = addActor(modeler, { point: { x: 150, y: 200 } });
            const workObject = addWorkObject(modeler, {
                point: { x: 450, y: 200 },
            });
            connect(modeler, actor, workObject);

            expect(modeler.commandStack.canUndo()).toBe(true);
            expect(modeler.commandStack.canRedo()).toBe(false);

            // Unwind everything; an empty canvas must be reachable by undo alone.
            while (modeler.commandStack.canUndo()) {
                modeler.commandStack.undo();
            }

            expect(
                modeler.elementRegistry
                    .getAll()
                    .filter((element) =>
                        [
                            ElementTypes.ACTOR,
                            ElementTypes.WORKOBJECT,
                            ElementTypes.ACTIVITY,
                        ].some((type) => element["type"]?.startsWith(type)),
                    ),
            ).toEqual([]);
        });
    });
});
