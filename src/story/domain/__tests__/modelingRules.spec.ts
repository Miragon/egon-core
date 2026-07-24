import { describe, expect, it } from "vitest";
import { ElementTypes } from "../elementTypes";
import {
    Bounds,
    GROUP_MIN_SIZE,
    canConnect,
    canConnectToAnnotation,
    canCreate,
    canResize,
    canStartConnection,
    clampGroupBounds,
} from "../modelingRules";

/**
 * Exhaustive grammar tests. `canConnect` is pinned as a full source/target
 * matrix (including the historical quirk that a group *source* is allowed and
 * yields an activity), and `clampGroupBounds` is pinned per corner plus its
 * purity contract — these are the two rules most likely to regress under the
 * domain extraction.
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

type ConnectResult = false | { type: ElementTypes };

describe("modelingRules", () => {
    describe("canConnect", () => {
        const cases: [
            keyof typeof ELEMENTS,
            keyof typeof ELEMENTS,
            ConnectResult,
        ][] = [
            // background either end is always denied
            ["background", "workObject", false],
            ["workObject", "background", false],
            // group as target is denied…
            ["workObject", "group", false],
            // …but group as source is allowed and yields an activity (pinned)
            ["group", "workObject", { type: ElementTypes.ACTIVITY }],
            ["group", "annotation", { type: ElementTypes.CONNECTION }],
            // actor↔actor denied
            ["actor", "secondActor", false],
            // activity/connection can never be an endpoint
            ["activity", "workObject", false],
            ["workObject", "activity", false],
            ["connection", "workObject", false],
            ["workObject", "connection", false],
            // annotation target ⇒ annotation connection
            ["actor", "annotation", { type: ElementTypes.CONNECTION }],
            ["workObject", "annotation", { type: ElementTypes.CONNECTION }],
            [
                "annotation",
                "secondAnnotation",
                { type: ElementTypes.CONNECTION },
            ],
            // ordinary pairs ⇒ activity
            ["actor", "workObject", { type: ElementTypes.ACTIVITY }],
            ["workObject", "actor", { type: ElementTypes.ACTIVITY }],
            ["workObject", "secondWorkObject", { type: ElementTypes.ACTIVITY }],
        ];

        it.each(cases)("%s → %s", (source, target, expected) => {
            expect(canConnect(ELEMENTS[source], ELEMENTS[target])).toEqual(
                expected,
            );
        });

        it("denies a self-connection (same element reference)", () => {
            expect(canConnect(ELEMENTS.workObject, ELEMENTS.workObject)).toBe(
                false,
            );
        });
    });

    describe("canConnectToAnnotation", () => {
        it("denies an activity landing on an annotation", () => {
            expect(
                canConnectToAnnotation(
                    ELEMENTS.actor,
                    ELEMENTS.annotation,
                    ELEMENTS.activity,
                ),
            ).toBe(false);
        });

        it("denies an annotation connection between two annotations", () => {
            expect(
                canConnectToAnnotation(
                    ELEMENTS.annotation,
                    ELEMENTS.annotation,
                    ELEMENTS.connection,
                ),
            ).toBe(false);
        });

        it("denies an annotation connection from an actor/work object to a non-annotation", () => {
            expect(
                canConnectToAnnotation(
                    ELEMENTS.actor,
                    ELEMENTS.workObject,
                    ELEMENTS.connection,
                ),
            ).toBe(false);
            expect(
                canConnectToAnnotation(
                    ELEMENTS.workObject,
                    ELEMENTS.actor,
                    ELEMENTS.connection,
                ),
            ).toBe(false);
        });

        it("allows an annotation connection onto an annotation target", () => {
            expect(
                canConnectToAnnotation(
                    ELEMENTS.actor,
                    ELEMENTS.annotation,
                    ELEMENTS.connection,
                ),
            ).toBe(true);
        });

        it("allows a non-annotation activity connection", () => {
            expect(
                canConnectToAnnotation(
                    ELEMENTS.actor,
                    ELEMENTS.workObject,
                    ELEMENTS.activity,
                ),
            ).toBe(true);
        });
    });

    describe("canResize", () => {
        it("permits only groups", () => {
            expect(canResize(ELEMENTS.group)).toBe(true);
            expect(canResize(ELEMENTS.workObject)).toBe(false);
            expect(canResize(null)).toBe(false);
        });
    });

    describe("canCreate", () => {
        it.each([
            ["on the background", "workObject", "background", true],
            ["group shape onto anything", "group", "actor", true],
            ["anything onto a group", "workObject", "group", true],
            [
                "ordinary shape onto ordinary shape",
                "workObject",
                "actor",
                false,
            ],
        ] as [string, keyof typeof ELEMENTS, keyof typeof ELEMENTS, boolean][])(
            "%s",
            (_label, shape, target, expected) => {
                expect(canCreate(ELEMENTS[shape], ELEMENTS[target])).toBe(
                    expected,
                );
            },
        );

        it("returns strict false when no target is present (adapter owns the tri-state)", () => {
            expect(canCreate(ELEMENTS.workObject, undefined)).toBe(false);
        });
    });

    describe("canStartConnection", () => {
        it("ignores a missing element or a label", () => {
            expect(canStartConnection(undefined)).toBeNull();
            expect(canStartConnection(null)).toBeNull();
            expect(
                canStartConnection({ label: { labelTarget: {} } }),
            ).toBeNull();
        });

        it("denies starting from a real, non-label element", () => {
            expect(canStartConnection({})).toBe(false);
            expect(canStartConnection({ label: undefined })).toBe(false);
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
