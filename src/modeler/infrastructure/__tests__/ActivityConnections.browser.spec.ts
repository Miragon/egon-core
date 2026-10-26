import { afterEach, describe, expect, it } from "vitest";
import type { Shape } from "diagram-js/lib/model/Types";
import type { Point } from "diagram-js/lib/util/Types";
import type BendpointMove from "diagram-js/lib/features/bendpoints/BendpointMove";
import type Dragging from "diagram-js/lib/features/dragging/Dragging";

import {
    createTestModeler,
    type TestModeler,
} from "../../../__tests__/helpers/createTestModeler";
import { canvasEvent } from "../../../__tests__/helpers/canvasEvent";
import {
    addActor,
    addAnnotation,
    addWorkObject,
    connect,
} from "../../../__tests__/helpers/storyBuilder";
import { ElementTypes } from "../../../story/domain/elementTypes";
import { isForbiddenAnnotationEdge } from "../../../story/domain/modelingRules";

/**
 * Activities and annotation connections through a real commandStack.
 * `DomainStoryRules.spec.ts` checks the verdicts; this checks that modeling and
 * the updater honour them (endpoint ids, cropping, reconnect undo).
 *
 * Browser tier (ADR TST-2): `canvas.addConnection` reaches
 * `SVGSVGElement.createSVGTransform`, which jsdom lacks, and cropping needs real
 * SVG geometry.
 */
describe("activity connections (browser)", () => {
    let modeler: TestModeler | undefined;

    afterEach(() => {
        modeler?.cleanup();
        modeler = undefined;
    });

    /** A horizontal actor → work object pair, far enough apart to stay disjoint. */
    function addHorizontalPair(current: TestModeler): {
        actor: Shape;
        workObject: Shape;
    } {
        return {
            actor: addActor(current, { point: { x: 150, y: 200 } }),
            workObject: addWorkObject(current, { point: { x: 450, y: 200 } }),
        };
    }

    describe("connection.create", () => {
        it("types an actor→work object edge as an activity and mirrors the endpoint ids", () => {
            modeler = createTestModeler();
            const { actor, workObject } = addHorizontalPair(modeler);

            // Connect reads the edge type off the rule, so don't hard-code it.
            const verdict = typedVerdict(
                modeler.rules.allowed("connection.create", {
                    source: actor,
                    target: workObject,
                }),
            );
            expect(verdict).toEqual({ type: ElementTypes.ACTIVITY });

            const activity = connect(modeler, actor, workObject, verdict.type)!;

            expect(activity["type"]).toBe(ElementTypes.ACTIVITY);
            expect(activity.businessObject.type).toBe(ElementTypes.ACTIVITY);
            // Ids, not element references: the exporter reads only these.
            expect(activity.businessObject.source).toBe(actor.id);
            expect(activity.businessObject.target).toBe(workObject.id);
            expect(actor.outgoing).toContain(activity);
            expect(workObject.incoming).toContain(activity);
            // Keyed on the diagram-js *factory* type, as in ModelingCommands.
            expect(activity.id).toMatch(/^connection_\d{4}$/);
        });

        it("types an edge onto an annotation as a plain connection", () => {
            modeler = createTestModeler();
            const workObject = addWorkObject(modeler, {
                point: { x: 200, y: 200 },
            });
            const annotation = addAnnotation(modeler, {
                point: { x: 500, y: 200 },
            });

            const verdict = typedVerdict(
                modeler.rules.allowed("connection.create", {
                    source: workObject,
                    target: annotation,
                }),
            );
            expect(verdict).toEqual({ type: ElementTypes.CONNECTION });

            const connection = connect(
                modeler,
                workObject,
                annotation,
                verdict.type,
            )!;

            expect(connection["type"]).toBe(ElementTypes.CONNECTION);
            expect(connection.businessObject.source).toBe(workObject.id);
            expect(connection.businessObject.target).toBe(annotation.id);
        });

        it("refuses an actor→actor edge at the rule layer", () => {
            modeler = createTestModeler();
            const alice = addActor(modeler, { point: { x: 150, y: 200 } });
            const bob = addActor(modeler, { point: { x: 450, y: 200 } });

            expect(
                modeler.rules.allowed("connection.create", {
                    source: alice,
                    target: bob,
                }),
            ).toBe(false);

            // Asserts the rule, not `modeling`: `CommandStack.execute` never
            // checks `canExecute`, so a direct `modeling.connect(alice, bob)` would
            // succeed. In diagram-js, rules guard only the interaction layer.
            expect(
                modeler.elementRegistry
                    .getAll()
                    .filter((element) =>
                        String(element["type"] ?? "").startsWith(
                            ElementTypes.ACTIVITY,
                        ),
                    ),
            ).toEqual([]);
        });
    });

    describe("connection.reconnect", () => {
        /**
         * `false`, not `undefined` (which `Rules.allowed` maps to `true`). Both
         * orientations, because `BendpointMove` retries a denied reconnect swapped.
         */
        it("refuses an activity→annotation reconnect in either orientation", () => {
            modeler = createTestModeler();
            const { actor, workObject } = addHorizontalPair(modeler);
            const annotation = addAnnotation(modeler, {
                point: { x: 450, y: 450 },
            });
            const activity = connect(modeler, actor, workObject)!;

            expect(isForbiddenAnnotationEdge(actor, annotation, activity)).toBe(
                true,
            );

            expect(
                modeler.rules.allowed("connection.reconnect", {
                    connection: activity,
                    source: actor,
                    target: annotation,
                }),
            ).toBe(false);
            expect(
                modeler.rules.allowed("connection.reconnect", {
                    connection: activity,
                    source: annotation,
                    target: actor,
                }),
            ).toBe(false);
        });

        /**
         * Proves the verdict above governs the real drag: with a target-only
         * clause the swap retry would land `annotation --ACTIVITY--> actor`.
         */
        it("refuses a bendpoint drag of an activity's end onto an annotation", () => {
            modeler = createTestModeler();
            modeler.get<Dragging>("dragging").setOptions({ manual: true });

            const { actor, workObject } = addHorizontalPair(modeler);
            const annotation = addAnnotation(modeler, {
                point: { x: 450, y: 450 },
            });
            const activity = connect(modeler, actor, workObject)!;

            const bendpointMove = modeler.get<BendpointMove>("bendpointMove");
            const dragging = modeler.get<Dragging>("dragging");
            const waypoints = activity.waypoints;
            const target = {
                x: annotation.x + annotation.width / 2,
                y: annotation.y + annotation.height / 2,
            };

            // The target-end bendpoint is the last waypoint ⇒ RECONNECT_END.
            bendpointMove.start(
                canvasEvent(modeler.canvas, waypoints[waypoints.length - 1]),
                activity,
                waypoints.length - 1,
                undefined,
            );
            dragging.hover({
                element: annotation,
                gfx: modeler.canvas.getGraphics(annotation),
            } as never);
            (dragging.move as (event: unknown) => void)(
                canvasEvent(modeler.canvas, target),
            );
            (dragging.end as () => void)();

            expect(activity.source).toBe(actor);
            expect(activity.target).toBe(workObject);
            expect(annotation.incoming).toHaveLength(0);
            expect(annotation.outgoing).toHaveLength(0);
        });

        it("moves the target and has the businessObject follow; undo restores it", () => {
            modeler = createTestModeler();
            const { actor, workObject } = addHorizontalPair(modeler);
            const secondWorkObject = addWorkObject(modeler, {
                point: { x: 450, y: 450 },
            });
            const activity = connect(modeler, actor, workObject)!;

            modeler.modeling.reconnectEnd(activity, secondWorkObject, {
                x: secondWorkObject.x + secondWorkObject.width / 2,
                y: secondWorkObject.y + secondWorkObject.height / 2,
            });

            expect(activity.target).toBe(secondWorkObject);
            expect(activity.businessObject.target).toBe(secondWorkObject.id);
            expect(workObject.incoming).toHaveLength(0);

            modeler.commandStack.undo();

            expect(activity.target).toBe(workObject);
            expect(activity.businessObject.target).toBe(workObject.id);
            expect(secondWorkObject.incoming).toHaveLength(0);
        });

        it("moves the source and has the businessObject follow; undo restores it", () => {
            modeler = createTestModeler();
            const { actor, workObject } = addHorizontalPair(modeler);
            const secondActor = addActor(modeler, {
                point: { x: 150, y: 450 },
            });
            const activity = connect(modeler, actor, workObject)!;

            modeler.modeling.reconnectStart(activity, secondActor, {
                x: secondActor.x + secondActor.width / 2,
                y: secondActor.y + secondActor.height / 2,
            });

            expect(activity.source).toBe(secondActor);
            expect(activity.businessObject.source).toBe(secondActor.id);

            modeler.commandStack.undo();

            expect(activity.source).toBe(actor);
            expect(activity.businessObject.source).toBe(actor.id);
        });
    });

    describe("waypoint cropping", () => {
        it("docks both ends on the outline instead of the shape centres", () => {
            modeler = createTestModeler();
            const { actor, workObject } = addHorizontalPair(modeler);

            const activity = connect(modeler, actor, workObject)!;

            // Two waypoints cropped or not; only the positions prove the crop.
            expect(activity.waypoints).toHaveLength(2);
            const [start, end] = croppedWaypoints(activity.waypoints);

            expect(start.original).toEqual({ x: 150, y: 200 });
            expect(start).not.toEqual(
                expect.objectContaining({ x: 150, y: 200 }),
            );

            expectPointOnOutlineOf(start, actor);
            expectPointOnOutlineOf(end, workObject);
            expect(start.x).toBeGreaterThan(actor.x + actor.width / 2);
            expect(end.x).toBeLessThan(workObject.x + workObject.width / 2);

            expect(start.x).toBeLessThan(end.x);
        });

        it("copies the cropped waypoints onto the businessObject", () => {
            modeler = createTestModeler();
            const { actor, workObject } = addHorizontalPair(modeler);

            const activity = connect(modeler, actor, workObject)!;

            // Cloned, not aliased, keeping the `original` anchor for the importer.
            expect(activity.businessObject.waypoints).not.toBe(
                activity.waypoints,
            );
            expect(activity.businessObject.waypoints).toEqual(
                croppedWaypoints(activity.waypoints).map((point) => ({
                    x: point.x,
                    y: point.y,
                    original: { ...point.original },
                })),
            );
            expect(activity.businessObject.waypoints[0]).not.toBe(
                activity.waypoints[0],
            );
        });

        it("re-crops after the target moves", () => {
            modeler = createTestModeler();
            const { actor, workObject } = addHorizontalPair(modeler);
            const activity = connect(modeler, actor, workObject)!;

            modeler.modeling.moveElements([workObject], { x: 0, y: 300 });

            const [start, end] = croppedWaypoints(activity.waypoints);
            expectPointOnOutlineOf(start, actor);
            expectPointOnOutlineOf(end, workObject);
            expect(start.y).toBeLessThan(end.y);
            expect(start.x).toBeLessThan(end.x);
        });
    });
});

/** `Rules.allowed` is typed `boolean | null`; connection rules return a type. */
function typedVerdict(verdict: unknown): { type: ElementTypes } {
    return verdict as { type: ElementTypes };
}

/** diagram-js' `Point` type omits the `original` anchor that docking adds. */
type CroppedPoint = Point & { original: Point };

function croppedWaypoints(waypoints: readonly Point[]): CroppedPoint[] {
    return waypoints as CroppedPoint[];
}

/**
 * Checks the rendered outline, not the bounding box: `getRectPath` uses
 * `width / 2 + 5` per half-edge from the top-left, so the outline overshoots the
 * right and bottom by 10 to keep the arrowhead clear of the icon.
 */
function expectPointOnOutlineOf(point: Point, shape: Shape): void {
    const outlineOvershoot = 10;
    expect(point.x).toBeGreaterThanOrEqual(shape.x);
    expect(point.x).toBeLessThanOrEqual(
        shape.x + shape.width + outlineOvershoot,
    );
    expect(point.y).toBeGreaterThanOrEqual(shape.y);
    expect(point.y).toBeLessThanOrEqual(
        shape.y + shape.height + outlineOvershoot,
    );
}
