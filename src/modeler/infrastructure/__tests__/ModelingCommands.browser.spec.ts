import { afterEach, describe, expect, it } from "vitest";
import type { Element, Shape } from "diagram-js/lib/model/Types";

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
 * Create/move/delete/resize through a real commandStack, proving the
 * `DomainStoryUpdater` wiring that mock-based specs cannot see.
 *
 * Browser tier (ADR TST-2): `canvas.addShape` reaches
 * `SVGSVGElement.createSVGTransform`, which jsdom does not implement.
 */
describe("modeling commands (browser)", () => {
    let modeler: TestModeler | undefined;

    afterEach(() => {
        modeler?.cleanup();
        modeler = undefined;
    });

    function exportedParent(booted: TestModeler, element: Element) {
        const document = JSON.parse(
            booted
                .get<{ export(): string }>("domainStoryExportService")
                .export(),
        );
        return document.domainStory.businessObjects.find(
            (businessObject: { id: string }) =>
                businessObject.id === element.id,
        )?.parent;
    }

    function expectGraphicsOwnedBy(
        booted: TestModeler,
        child: Shape,
        parent: Shape,
    ) {
        const childGraphics = booted.canvas.getGraphics(child);
        const parentGraphics = booted.canvas.getGraphics(parent);
        expect(childGraphics.parentElement?.parentElement).toBe(
            parentGraphics.parentElement?.querySelector(
                ":scope > .djs-children",
            ),
        );
    }

    describe("shape.create", () => {
        it("registers an actor with the default size and a typed id", () => {
            modeler = createTestModeler();

            const actor = addActor(modeler, { name: "Alice" });

            expect(modeler.elementRegistry.get(actor.id)).toBe(actor);
            // Ids use diagram-js' factory type ("shape"), not the element type.
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

            // CreateShapeHandler centres the shape: 200 - round(75 / 2) = 162.
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

            // Without the updater's revert branch the export keeps the move.
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

            // Only groups are resizable, so only they persist width/height.
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

            const group = addGroup(modeler, { point: { x: 400, y: 300 } });

            expect(group.children).toContain(actor);
            expect(actor.parent).toBe(group);
        });

        it("adopts transactionally on create, undo and redo", () => {
            modeler = createTestModeler();
            const actor = addActor(modeler, { point: { x: 450, y: 300 } });
            const actorPosition = { x: actor.x, y: actor.y };

            const group = addGroup(modeler, {
                point: { x: 450, y: 300 },
                width: 300,
                height: 250,
            });

            expect(actor.parent).toBe(group);
            expect(
                group.children.filter((child) => child === actor),
            ).toHaveLength(1);
            expect(actor.businessObject.parent).toBe(group.id);
            expect(exportedParent(modeler, actor)).toBe(group.id);
            expect({ x: actor.x, y: actor.y }).toEqual(actorPosition);
            expectGraphicsOwnedBy(modeler, actor, group);

            modeler.commandStack.undo();

            expect(modeler.elementRegistry.get(group.id)).toBeUndefined();
            expect(actor.parent).toBe(modeler.root);
            expect(actor.businessObject.parent).toBeUndefined();
            expect(exportedParent(modeler, actor)).toBeUndefined();
            expect({ x: actor.x, y: actor.y }).toEqual(actorPosition);

            modeler.commandStack.redo();

            expect(modeler.elementRegistry.get(group.id)).toBe(group);
            expect(actor.parent).toBe(group);
            expect(actor.businessObject.parent).toBe(group.id);
            expect(exportedParent(modeler, actor)).toBe(group.id);
            expectGraphicsOwnedBy(modeler, actor, group);

            modeler.commandStack.undo();
            modeler.modeling.moveShape(actor, { x: 10, y: 5 }, modeler.root);
            modeler.modeling.removeShape(actor);
            modeler.commandStack.undo();
            expect(modeler.elementRegistry.get(actor.id)).toBe(actor);
            modeler.commandStack.undo();
            expect({ x: actor.x, y: actor.y }).toEqual(actorPosition);
        });

        it("moves existing children once and adopts stationary siblings after a bulk move", () => {
            modeler = createTestModeler();
            const existingChild = addActor(modeler, {
                point: { x: 200, y: 200 },
            });
            const group = addGroup(modeler, { point: { x: 200, y: 200 } });
            const newChild = addWorkObject(modeler, {
                point: { x: 500, y: 200 },
            });
            const nestedActor = addActor(modeler, {
                point: { x: 510, y: 225 },
            });
            const nestedGroup = addGroup(modeler, {
                point: { x: 510, y: 225 },
                width: 120,
                height: 100,
            });
            const rootOrder = modeler.root["children"].map(
                (child: Element) => child.id,
            );
            const groupPosition = { x: group.x, y: group.y };
            const existingPosition = {
                x: existingChild.x,
                y: existingChild.y,
            };
            const newPosition = { x: newChild.x, y: newChild.y };
            const nestedPosition = { x: nestedGroup.x, y: nestedGroup.y };
            const nestedActorPosition = { x: nestedActor.x, y: nestedActor.y };

            modeler.modeling.moveElements(
                [group, existingChild],
                { x: 300, y: 0 },
                modeler.root,
                { primaryShape: group },
            );

            expect({ x: group.x, y: group.y }).toEqual({
                x: groupPosition.x + 300,
                y: groupPosition.y,
            });
            expect({ x: existingChild.x, y: existingChild.y }).toEqual({
                x: existingPosition.x + 300,
                y: existingPosition.y,
            });
            expect({ x: newChild.x, y: newChild.y }).toEqual(newPosition);
            expect({ x: nestedGroup.x, y: nestedGroup.y }).toEqual(
                nestedPosition,
            );
            expect({ x: nestedActor.x, y: nestedActor.y }).toEqual(
                nestedActorPosition,
            );
            expect(group.children).toEqual([
                existingChild,
                newChild,
                nestedGroup,
            ]);
            expect(nestedActor.parent).toBe(nestedGroup);
            expect(newChild.businessObject.parent).toBe(group.id);
            expect(nestedGroup.businessObject.parent).toBe(group.id);

            modeler.commandStack.undo();

            expect({ x: group.x, y: group.y }).toEqual(groupPosition);
            expect({ x: existingChild.x, y: existingChild.y }).toEqual(
                existingPosition,
            );
            expect({ x: newChild.x, y: newChild.y }).toEqual(newPosition);
            expect(newChild.parent).toBe(modeler.root);
            expect(nestedGroup.parent).toBe(modeler.root);
            expect(nestedActor.parent).toBe(nestedGroup);
            expect(
                modeler.root["children"].map((child: Element) => child.id),
            ).toEqual(rootOrder);

            modeler.commandStack.redo();
            expect(group.children).toEqual([
                existingChild,
                newChild,
                nestedGroup,
            ]);
            expect({ x: newChild.x, y: newChild.y }).toEqual(newPosition);
            expectGraphicsOwnedBy(modeler, newChild, group);
            expectGraphicsOwnedBy(modeler, nestedGroup, group);
        });

        it("adopts on growth but retains children when the group shrinks", () => {
            modeler = createTestModeler();
            const group = addGroup(modeler, {
                point: { x: 200, y: 200 },
                width: 125,
                height: 125,
            });
            const actor = addActor(modeler, { point: { x: 400, y: 200 } });
            const actorPosition = { x: actor.x, y: actor.y };

            modeler.modeling.resizeShape(group, {
                x: group.x,
                y: group.y,
                width: 300,
                height: group.height,
            });

            expect(actor.parent).toBe(group);
            expect({ x: actor.x, y: actor.y }).toEqual(actorPosition);

            modeler.modeling.resizeShape(group, {
                x: group.x,
                y: group.y,
                width: 125,
                height: group.height,
            });

            expect(actor.parent).toBe(group);
            expect(actor.businessObject.parent).toBe(group.id);
            expect({ x: actor.x, y: actor.y }).toEqual(actorPosition);
        });

        it("normalizes group drops and never parents a group beneath its descendant", () => {
            modeler = createTestModeler();
            const actor = addActor(modeler, { point: { x: 400, y: 300 } });
            const groupShape = modeler.elementFactory.create("shape", {
                type: ElementTypes.GROUP,
                width: 300,
                height: 250,
            });

            const group = modeler.modeling.createShape(
                groupShape,
                { x: 400, y: 300 },
                actor as never,
            );

            expect(group.parent).toBe(modeler.root);
            expect(actor.parent).toBe(group);

            modeler.modeling.moveElements([group], { x: 0, y: 0 }, actor);

            expect(group.parent).toBe(modeler.root);
            expect(actor.parent).toBe(group);
            expect(group.children).toContain(actor);

            const selfTargetedShape = modeler.elementFactory.create("shape", {
                type: ElementTypes.GROUP,
                width: 125,
                height: 125,
            });
            const selfTargeted = modeler.modeling.createShape(
                selfTargetedShape,
                { x: 700, y: 500 },
                selfTargetedShape,
            );
            expect(selfTargeted.parent).toBe(modeler.root);
        });

        it("uses a connection's enclosing parent and never adopts the connection", () => {
            modeler = createTestModeler();
            const actor = addActor(modeler, { point: { x: 150, y: 150 } });
            const workObject = addWorkObject(modeler, {
                point: { x: 650, y: 150 },
            });
            const activity = connect(modeler, actor, workObject)!;
            const groupShape = modeler.elementFactory.create("shape", {
                type: ElementTypes.GROUP,
                width: 300,
                height: 250,
            });

            const group = modeler.modeling.createShape(
                groupShape,
                { x: 400, y: 400 },
                activity as never,
            );

            expect(group.parent).toBe(modeler.root);
            expect(activity.parent).toBe(modeler.root);
            expect(group.children).not.toContain(activity);

            modeler.modeling.moveElements(
                [group],
                { x: 0, y: 0 },
                activity as never,
            );
            expect(group.parent).toBe(modeler.root);
            expect(group.children).not.toContain(activity);
        });

        it("moves a shape back out of a group", () => {
            modeler = createTestModeler();
            const group = addGroup(modeler, { point: { x: 400, y: 300 } });
            // Adoption runs only when the group is created, moved or resized.
            const actor = addActor(modeler, { point: { x: 400, y: 300 } });
            modeler.modeling.moveElements([actor], { x: 0, y: 0 }, group);
            expect(actor.parent).toBe(group);

            modeler.modeling.moveElements(
                [actor],
                { x: 0, y: 0 },
                modeler.root as any,
            );

            expect(actor.parent).toBe(modeler.root);
            expect(actor.businessObject.parent).toBeUndefined();
        });

        it("adopts group-into-group and deletes the whole stack at once", () => {
            modeler = createTestModeler();
            const actor = addActor(modeler, { point: { x: 400, y: 300 } });
            const childGroup = addGroup(modeler, {
                point: { x: 400, y: 300 },
                width: 120,
                height: 100,
            });
            const group = addGroup(modeler, { point: { x: 400, y: 300 } });

            // A group adopts only siblings that exist when drawn, so the actor
            // stays the inner group's child.
            expect(actor.parent).toBe(childGroup);
            expect(childGroup.parent).toBe(group);
            expect(modeler.root["children"]).not.toContain(actor);

            modeler.modeling.removeElements([group]);

            expect(modeler.elementRegistry.get(group.id)).toBeUndefined();
            expect(modeler.elementRegistry.get(childGroup.id)).toBeUndefined();
            expect(modeler.elementRegistry.get(actor.id)).toBeUndefined();
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
            // `removeGroup` fans out into nested commands sharing one action id,
            // so it must still cost exactly one undo.
            const group = addGroup(modeler, { point: { x: 400, y: 500 } });
            modeler.modeling.removeGroup(group);

            expect(modeler.commandStack.canUndo()).toBe(true);
            expect(modeler.commandStack.canRedo()).toBe(false);

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
