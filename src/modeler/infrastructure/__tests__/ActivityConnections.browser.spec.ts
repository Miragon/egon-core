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
 * The connection half of issue #55: activities and annotation connections driven
 * through a real commandStack.
 *
 * WHY this exists next to `rules/__tests__/DomainStoryRules.spec.ts`: that spec
 * fires the rule events directly and asserts the *verdicts* of the grammar. It
 * cannot see whether `modeling` and the updater then honour them — that
 * `DomainStoryUpdater.updateConnection` mirrors the endpoint **ids** onto the
 * business object (the only place that mapping happens, so an export depends on
 * it), that `cropConnection` really docks the line at the shape borders, and that
 * a reconnect plus undo keeps element and business object in step. Those are the
 * seams an upstream sync breaks silently.
 *
 * WHY browser tier and not jsdom (ADR 0014): creating a connection reaches
 * `canvas.addConnection` → tiny-svg `translate()` →
 * `SVGSVGElement.createSVGTransform`, which jsdom does not implement, and the
 * cropping asserted here needs real SVG geometry.
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

            // The grammar decides the edge type; the interactive Connect feature
            // reads it off the rule, so a spec that hard-codes the type would
            // never notice the two disagreeing.
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
            // Ids, not element references: `DomainStoryUpdater.updateConnection`
            // is the single place that maps endpoints to ids, and the exporter
            // reads only the business object.
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

            // …and nothing reached the canvas, because nothing consulted a
            // forbidden verdict. NOTE: this asserts the rule, not `modeling`.
            // `Modeling.connect` executes `connection.create` on the
            // commandStack, and `CommandStack.execute` never calls its own
            // `canExecute` — so a *direct* `modeling.connect(alice, bob)` does
            // create an illegal edge. That is diagram-js' documented division of
            // labour (rules guard the interaction layer: Connect, Bendpoints,
            // CopyPaste), not a defect here; every UI path asks `rules.allowed`
            // first. Pinning it as "modeling refuses" would test a fiction, so
            // `storyBuilder.connect` says the same in its doc comment.
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
         * Issue #66, half one: the rule now answers `false` rather than
         * `undefined` (which `Rules.allowed` maps to `true`). Both orientations
         * are asserted because `BendpointMove` retries a denied reconnect with
         * the endpoints swapped.
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
         * Issue #66, half two — **not** redundant with the rule-level case
         * above. That one pins the *verdict*; this one proves the verdict is
         * what actually governs the interaction, so the pair above cannot drift
         * into asserting an answer no code path reads.
         *
         * It is the swap retry that makes the distinction load-bearing: `false`
         * is what *enters* it, so with a target-only grammar clause the retry is
         * allowed and this drag lands the same forbidden edge reversed
         * (`annotation --ACTIVITY--> actor`) — verified by narrowing the clause
         * and watching `activity.source` become the annotation.
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

            // Both orientations deny, so `bendpoint.move.end` bails before
            // `modeling.reconnect` — the model is untouched.
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

            // A straight edge between two disjoint shapes: `BaseLayouter` lays it
            // out centre-to-centre, then `DomainStoryUpdater.cropConnection`
            // docks the ends. Two waypoints either way, so the count alone proves
            // nothing — the *positions* do.
            expect(activity.waypoints).toHaveLength(2);
            const [start, end] = croppedWaypoints(activity.waypoints);

            // The uncropped anchor is kept as `original`, so the crop is visible
            // as a difference rather than having to be recomputed here.
            expect(start.original).toEqual({ x: 150, y: 200 });
            expect(start).not.toEqual(
                expect.objectContaining({ x: 150, y: 200 }),
            );

            // Exact pixels depend on the docking maths; what must hold is that
            // each end was pulled outward, past its own shape's centre, onto that
            // shape's outline.
            expectPointOnOutlineOf(start, actor);
            expectPointOnOutlineOf(end, workObject);
            expect(start.x).toBeGreaterThan(actor.x + actor.width / 2);
            expect(end.x).toBeLessThan(workObject.x + workObject.width / 2);

            // Left-to-right story: x must increase monotonically along the line.
            expect(start.x).toBeLessThan(end.x);
        });

        it("copies the cropped waypoints onto the businessObject", () => {
            modeler = createTestModeler();
            const { actor, workObject } = addHorizontalPair(modeler);

            const activity = connect(modeler, actor, workObject)!;

            // `copyWaypoints` clones rather than aliases, so the exported story
            // cannot be mutated from under the canvas — but it does carry the
            // `original` anchor along, which the importer relies on.
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
            // The line now runs down-right, so y must increase along it too.
            expect(start.y).toBeLessThan(end.y);
            expect(start.x).toBeLessThan(end.x);
        });
    });
});

/**
 * `Rules.allowed` is typed `boolean | null`, but the grammar answers a connection
 * question with the resulting element type. Narrowing it once here keeps the
 * double cast out of the test bodies.
 */
function typedVerdict(verdict: unknown): { type: ElementTypes } {
    return verdict as { type: ElementTypes };
}

/**
 * A cropped waypoint additionally carries the uncropped anchor as `original` —
 * diagram-js' own docking contract, which `DomainStoryUpdater.copyWaypoints`
 * preserves. diagram-js' `Point` type does not declare it.
 */
type CroppedPoint = Point & { original: Point };

function croppedWaypoints(waypoints: readonly Point[]): CroppedPoint[] {
    return waypoints as CroppedPoint[];
}

/**
 * Asserts a docking point lies on the shape's *rendered* outline rather than its
 * bounding box. `CroppingConnectionDocking` intersects the path that
 * `DomainStoryRenderer.getShapePath` hands it, and that path is deliberately
 * larger than the box: `getRectPath` uses `width / 2 + 5` per half-edge, so the
 * outline reaches 10 units past the box's right and bottom edges (it is anchored
 * at the top-left corner, not centred). That 5-unit offset is what keeps the
 * arrowhead clear of the icon, so a bounding-box assertion here would be wrong,
 * not merely stricter.
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
