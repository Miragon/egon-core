import { describe, expect, it } from "vitest";
import { ElementTypes } from "../elementTypes";
import {
    Bounds,
    GROUP_MIN_SIZE,
    clampGroupBounds,
    isForbiddenAnnotationEdge,
    judgeConnection,
    judgeConnectionStart,
    judgeCreation,
    judgeReconnect,
    judgeResize,
} from "../modelingRules";
import { ALLOWED, DENIED, RuleVerdict, allowedAs } from "../ruleVerdict";

/**
 * Exhaustive grammar tests. `judgeConnection` is pinned as a full source/target
 * matrix (including the historical quirk that a group *source* is allowed and
 * yields an activity), and `clampGroupBounds` is pinned per corner plus its
 * purity contract — these are the two rules most likely to regress under the
 * domain extraction. The verdicts are asserted as whole objects so a kind
 * silently changing to another kind (the #66 failure mode) cannot pass.
 */

const ELEMENTS = {
    actor: { type: ElementTypes.ACTOR, id: "actor-1" },
    secondActor: { type: ElementTypes.ACTOR + "Person", id: "actor-2" },
    workObject: { type: ElementTypes.WORKOBJECT, id: "wo-1" },
    secondWorkObject: {
        type: ElementTypes.WORKOBJECT + "Document",
        id: "wo-2",
    },
    activity: { type: ElementTypes.ACTIVITY, id: "activity-1" },
    connection: { type: ElementTypes.CONNECTION, id: "connection-1" },
    annotation: { type: ElementTypes.TEXTANNOTATION, id: "annotation-1" },
    secondAnnotation: { type: ElementTypes.TEXTANNOTATION, id: "annotation-2" },
    group: { type: ElementTypes.GROUP, id: "group-1" },
    background: { id: "__implicitroot" },
};

describe("modelingRules", () => {
    describe("judgeConnection", () => {
        const cases: [
            keyof typeof ELEMENTS,
            keyof typeof ELEMENTS,
            RuleVerdict,
        ][] = [
            // background either end is always denied
            ["background", "workObject", DENIED],
            ["workObject", "background", DENIED],
            // group as target is denied…
            ["workObject", "group", DENIED],
            // …but group as source is allowed and yields an activity (pinned)
            ["group", "workObject", allowedAs(ElementTypes.ACTIVITY)],
            ["group", "annotation", allowedAs(ElementTypes.CONNECTION)],
            // actor↔actor denied
            ["actor", "secondActor", DENIED],
            // activity/connection can never be an endpoint
            ["activity", "workObject", DENIED],
            ["workObject", "activity", DENIED],
            ["connection", "workObject", DENIED],
            ["workObject", "connection", DENIED],
            // annotation target ⇒ annotation connection
            ["actor", "annotation", allowedAs(ElementTypes.CONNECTION)],
            ["workObject", "annotation", allowedAs(ElementTypes.CONNECTION)],
            [
                "annotation",
                "secondAnnotation",
                allowedAs(ElementTypes.CONNECTION),
            ],
            // ordinary pairs ⇒ activity
            ["actor", "workObject", allowedAs(ElementTypes.ACTIVITY)],
            ["workObject", "actor", allowedAs(ElementTypes.ACTIVITY)],
            [
                "workObject",
                "secondWorkObject",
                allowedAs(ElementTypes.ACTIVITY),
            ],
        ];

        it.each(cases)("%s → %s", (source, target, expected) => {
            expect(judgeConnection(ELEMENTS[source], ELEMENTS[target])).toEqual(
                expected,
            );
        });

        it("denies a self-connection (same element reference)", () => {
            expect(
                judgeConnection(ELEMENTS.workObject, ELEMENTS.workObject),
            ).toEqual(DENIED);
        });

        // The grammar never defers: a "no opinion" would reach diagram-js as
        // `undefined`, which `Rules.allowed` reads as *allowed* (issue #66).
        it("never answers with a deferral", () => {
            const kinds = new Set(
                cases.map(
                    ([source, target]) =>
                        judgeConnection(ELEMENTS[source], ELEMENTS[target])
                            .kind,
                ),
            );
            expect([...kinds].sort()).toEqual(["allowed", "denied"]);
        });
    });

    describe("isForbiddenAnnotationEdge", () => {
        it("denies an activity landing on an annotation", () => {
            expect(
                isForbiddenAnnotationEdge(
                    ELEMENTS.actor,
                    ELEMENTS.annotation,
                    ELEMENTS.activity,
                ),
            ).toBe(true);
        });

        // An annotation is only ever an edge target, so the swapped orientation
        // `BendpointMove` retries must be denied too.
        it("denies an activity touching an annotation at its source", () => {
            expect(
                isForbiddenAnnotationEdge(
                    ELEMENTS.annotation,
                    ELEMENTS.actor,
                    ELEMENTS.activity,
                ),
            ).toBe(true);
        });

        it("denies an annotation connection between two annotations", () => {
            expect(
                isForbiddenAnnotationEdge(
                    ELEMENTS.annotation,
                    ELEMENTS.annotation,
                    ELEMENTS.connection,
                ),
            ).toBe(true);
        });

        it("denies an annotation connection from an actor/work object to a non-annotation", () => {
            expect(
                isForbiddenAnnotationEdge(
                    ELEMENTS.actor,
                    ELEMENTS.workObject,
                    ELEMENTS.connection,
                ),
            ).toBe(true);
            expect(
                isForbiddenAnnotationEdge(
                    ELEMENTS.workObject,
                    ELEMENTS.actor,
                    ELEMENTS.connection,
                ),
            ).toBe(true);
        });

        it("allows an annotation connection onto an annotation target", () => {
            expect(
                isForbiddenAnnotationEdge(
                    ELEMENTS.actor,
                    ELEMENTS.annotation,
                    ELEMENTS.connection,
                ),
            ).toBe(false);
        });

        it("allows a non-annotation activity connection", () => {
            expect(
                isForbiddenAnnotationEdge(
                    ELEMENTS.actor,
                    ELEMENTS.workObject,
                    ELEMENTS.activity,
                ),
            ).toBe(false);
        });
    });

    describe("judgeReconnect", () => {
        // A forbidden edge must be `denied`, never `noOpinion` — the whole point
        // of issue #66 was that a deferral here reaches diagram-js as *allowed*.
        it("denies a forbidden annotation edge in both orientations", () => {
            expect(
                judgeReconnect(
                    ELEMENTS.actor,
                    ELEMENTS.annotation,
                    ELEMENTS.activity,
                ),
            ).toEqual(DENIED);
            expect(
                judgeReconnect(
                    ELEMENTS.annotation,
                    ELEMENTS.actor,
                    ELEMENTS.activity,
                ),
            ).toEqual(DENIED);
        });

        it("falls through to the connection grammar otherwise", () => {
            expect(
                judgeReconnect(
                    ELEMENTS.actor,
                    ELEMENTS.workObject,
                    ELEMENTS.activity,
                ),
            ).toEqual(allowedAs(ElementTypes.ACTIVITY));
            expect(
                judgeReconnect(
                    ELEMENTS.actor,
                    ELEMENTS.secondActor,
                    ELEMENTS.activity,
                ),
            ).toEqual(DENIED);
        });
    });

    describe("judgeResize", () => {
        it("permits only groups", () => {
            expect(judgeResize(ELEMENTS.group)).toEqual(ALLOWED);
            expect(judgeResize(ELEMENTS.workObject)).toEqual(DENIED);
            expect(judgeResize(null)).toEqual(DENIED);
        });
    });

    describe("judgeCreation", () => {
        it.each([
            ["on the background", "workObject", "background", ALLOWED],
            ["group shape onto anything", "group", "actor", ALLOWED],
            ["anything onto a group", "workObject", "group", ALLOWED],
            [
                "ordinary shape onto ordinary shape",
                "workObject",
                "actor",
                DENIED,
            ],
        ] as [
            string,
            keyof typeof ELEMENTS,
            keyof typeof ELEMENTS,
            RuleVerdict,
        ][])("%s", (_label, shape, target, expected) => {
            expect(judgeCreation(ELEMENTS[shape], ELEMENTS[target])).toEqual(
                expected,
            );
        });

        // The deferral the adapter used to invent for itself now belongs to the
        // grammar; denying here would forbid dragging any non-group over canvas.
        it("defers with no hover target, unless the shape is a group", () => {
            expect(judgeCreation(ELEMENTS.workObject, undefined)).toEqual({
                kind: "noOpinion",
                reason: "noHoverTarget",
            });
            expect(judgeCreation(ELEMENTS.group, undefined)).toEqual(ALLOWED);
        });
    });

    describe("judgeConnectionStart", () => {
        it("ignores a missing element or a label", () => {
            expect(judgeConnectionStart(undefined)).toEqual({
                kind: "ignored",
                reason: "missingElement",
            });
            expect(judgeConnectionStart(null)).toEqual({
                kind: "ignored",
                reason: "missingElement",
            });
            expect(
                judgeConnectionStart({ label: { labelTarget: {} } }),
            ).toEqual({
                kind: "ignored",
                reason: "labelOwnedByAnotherElement",
            });
        });

        it("denies starting from a real, non-label element", () => {
            expect(judgeConnectionStart({})).toEqual(DENIED);
            expect(judgeConnectionStart({ label: undefined })).toEqual(DENIED);
        });
    });

    describe("clampGroupBounds", () => {
        const current: Bounds = { x: 0, y: 0, width: 300, height: 300 };

        it("clamps the upper-left corner past the opposite edge", () => {
            const result = clampGroupBounds(current, {
                x: 250,
                y: 250,
                width: 50,
                height: 50,
            });
            expect(result).toEqual({
                x: 175,
                y: 175,
                width: GROUP_MIN_SIZE,
                height: GROUP_MIN_SIZE,
            });
        });

        it("clamps the lower-left corner in x only", () => {
            const result = clampGroupBounds(current, {
                x: 250,
                y: 0,
                width: 50,
                height: 200,
            });
            expect(result).toEqual({
                x: 175,
                y: 0,
                width: GROUP_MIN_SIZE,
                height: 200,
            });
        });

        it("clamps the upper-right corner in y only", () => {
            const result = clampGroupBounds(current, {
                x: 0,
                y: 250,
                width: 200,
                height: 50,
            });
            expect(result).toEqual({
                x: 0,
                y: 175,
                width: 200,
                height: GROUP_MIN_SIZE,
            });
        });

        it("floors width and height at the minimum size", () => {
            const result = clampGroupBounds(current, {
                x: 0,
                y: 0,
                width: 50,
                height: 50,
            });
            expect(result).toEqual({
                x: 0,
                y: 0,
                width: GROUP_MIN_SIZE,
                height: GROUP_MIN_SIZE,
            });
        });

        it("passes an in-range resize through untouched", () => {
            const requested: Bounds = {
                x: 10,
                y: 10,
                width: 400,
                height: 400,
            };
            expect(clampGroupBounds(current, requested)).toEqual(requested);
        });

        it("is pure: returns a new object and never mutates its inputs", () => {
            const requested: Bounds = { x: 250, y: 250, width: 50, height: 50 };
            const requestedSnapshot = { ...requested };
            const currentSnapshot = { ...current };

            const result = clampGroupBounds(current, requested);

            expect(result).not.toBe(requested);
            expect(requested).toEqual(requestedSnapshot);
            expect(current).toEqual(currentSnapshot);
        });
    });
});
