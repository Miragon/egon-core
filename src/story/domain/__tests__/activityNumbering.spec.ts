import { describe, expect, it } from "vitest";
import {
    activitiesFromActors,
    nextAvailableActivityNumber,
    renumberOnNumberEdit,
    restoredNumberAssignments,
} from "../activityNumbering";
import { ElementTypes } from "../elementTypes";

describe("nextAvailableActivityNumber", () => {
    it.each([
        { used: [], expected: 1, why: "an empty story starts at 1" },
        { used: [1, 2], expected: 3, why: "a contiguous sequence grows" },
        { used: [1, 3], expected: 2, why: "a gap is refilled first" },
        { used: [2, 3], expected: 1, why: "a leading gap is refilled first" },
        { used: [5], expected: 1, why: "sparse numbers leave 1 free" },
        { used: [1, 1], expected: 2, why: "duplicates count as one number" },
        { used: [3, 1, 2], expected: 4, why: "order of use does not matter" },
    ])("returns $expected for $used ($why)", ({ used, expected }) => {
        expect(nextAvailableActivityNumber(used)).toBe(expected);
    });

    it("ignores activities without a number (undefined, null, 0)", () => {
        expect(nextAvailableActivityNumber([undefined, null, 0, 2])).toBe(1);
    });
});

describe("renumberOnNumberEdit", () => {
    const activity = (id: string, number?: number | null) => ({ id, number });

    /** The edited activity, addressed by an id no fixture below reuses. */
    const edit = (number: number, multipleAllowed = false) => ({
        id: "edited",
        number,
        multipleAllowed,
    });

    it("returns no assignments when the edited number is free", () => {
        const result = renumberOnNumberEdit(
            [activity("a", 1), activity("b", 2)],
            edit(3),
            [],
        );

        expect(result.assignments).toEqual([]);
        // T1.3: nothing moves, but the edit's own allowance is still recorded —
        // it is the caller's only channel for the flag.
        expect(result.multipleAllowedUpdates).toEqual([
            { number: 3, allowed: false },
        ]);
    });

    it("shifts every occupied number at or above the edited one up by one", () => {
        const result = renumberOnNumberEdit(
            [activity("a", 1), activity("b", 2), activity("c", 3)],
            edit(2),
            [],
        );

        expect(result.assignments).toEqual([
            { id: "b", newNumber: 3 },
            { id: "c", newNumber: 4 },
        ]);
    });

    it("compacts gaps above the edited number into consecutive slots", () => {
        // numbers {1, 2, 5}, another activity takes 2: 2 → 3 and 5 → 4
        const result = renumberOnNumberEdit(
            [activity("a", 1), activity("b", 2), activity("c", 5)],
            edit(2),
            [],
        );

        expect(result.assignments).toEqual([
            { id: "b", newNumber: 3 },
            { id: "c", newNumber: 4 },
        ]);
    });

    it("leaves numbers below the edited one untouched", () => {
        const result = renumberOnNumberEdit(
            [activity("a", 1), activity("b", 2), activity("c", 4)],
            edit(3),
            [],
        );

        expect(result.assignments).toEqual([{ id: "c", newNumber: 4 }]);
    });

    it("moves activities sharing one number together", () => {
        const result = renumberOnNumberEdit(
            [activity("a", 2), activity("b", 2), activity("c", 3)],
            edit(2),
            [],
        );

        expect(result.assignments).toEqual([
            { id: "a", newNumber: 3 },
            { id: "b", newNumber: 3 },
            { id: "c", newNumber: 4 },
        ]);
    });

    it("carries the multiple-number allowance from old slot to new slot", () => {
        const multipleAllowed: boolean[] = [];
        multipleAllowed[2] = true;
        multipleAllowed[3] = false;

        const result = renumberOnNumberEdit(
            [activity("a", 2), activity("b", 3)],
            edit(2),
            multipleAllowed,
        );

        expect(result.multipleAllowedUpdates).toEqual([
            { number: 2, allowed: false },
            { number: 3, allowed: true },
            { number: 4, allowed: false },
        ]);
    });

    it("defaults an unset allowance flag to false", () => {
        const result = renumberOnNumberEdit([activity("a", 2)], edit(2), []);

        expect(result.multipleAllowedUpdates).toEqual([
            { number: 2, allowed: false },
            { number: 3, allowed: false },
        ]);
    });

    it("ignores activities without a number", () => {
        const result = renumberOnNumberEdit(
            [activity("a", undefined), activity("b", null), activity("c", 1)],
            edit(1),
            [],
        );

        expect(result.assignments).toEqual([{ id: "c", newNumber: 2 }]);
    });

    it("returns nothing for an empty story", () => {
        const result = renumberOnNumberEdit([], edit(1), []);

        expect(result.assignments).toEqual([]);
        expect(result.multipleAllowedUpdates).toEqual([
            { number: 1, allowed: false },
        ]);
    });

    // T1.1 — death certificate of the `splice(indexOf(...) === -1, 1)` defect:
    // the caller no longer has to remove the edited activity from the list, so
    // it can no longer remove the wrong one.
    it("excludes the edited activity from its own cascade", () => {
        const result = renumberOnNumberEdit(
            [activity("edited", 3), activity("a", 1), activity("b", 2)],
            edit(1),
            [],
        );

        // Only a and b move; "edited" is not told to shift away from the number
        // it is claiming.
        expect(result.assignments).toEqual([
            { id: "a", newNumber: 2 },
            { id: "b", newNumber: 3 },
        ]);
    });

    // T1.2
    it("suppresses the cascade entirely when the number may be shared", () => {
        const result = renumberOnNumberEdit(
            [activity("a", 1), activity("b", 2)],
            edit(1, true),
            [],
        );

        expect(result.assignments).toEqual([]);
        expect(result.multipleAllowedUpdates).toEqual([
            { number: 1, allowed: true },
        ]);
    });

    // T1.4
    it("emits the edited number's allowance before the shifted ones", () => {
        const result = renumberOnNumberEdit([activity("a", 1)], edit(1), [
            false,
            true,
        ]);

        expect(result.multipleAllowedUpdates[0]).toEqual({
            number: 1,
            allowed: false,
        });
    });

    // T1.5 — `multipleAllowedByNumber` is read pre-edit, so slot 1 still holds
    // the *previous* occupant's flag and that flag moves up with them. The popup
    // used to overwrite the slot before the cascade read it, so a shifted
    // activity silently lost its allowance. Deliberate behaviour fix.
    it("carries the previous occupant's flag upward, not the edit's", () => {
        const multipleAllowed: boolean[] = [];
        multipleAllowed[1] = true;

        const result = renumberOnNumberEdit(
            [activity("a", 1)],
            edit(1, false),
            multipleAllowed,
        );

        expect(result.multipleAllowedUpdates).toEqual([
            { number: 1, allowed: false },
            { number: 2, allowed: true },
        ]);
    });
});

describe("restoredNumberAssignments", () => {
    it("restores each live activity's number from its snapshot entry", () => {
        const assignments = restoredNumberAssignments(
            [
                { id: "a", number: 1 },
                { id: "b", number: 2 },
            ],
            ["a", "b"],
        );

        expect(assignments).toEqual([
            { id: "a", number: 1 },
            { id: "b", number: 2 },
        ]);
    });

    it("matches ids exactly, not by substring", () => {
        // regression: the former `includes` matching let `activity_1` claim
        // `activity_12`'s snapshot entry, restoring the wrong number on undo
        const assignments = restoredNumberAssignments(
            [
                { id: "activity_12", number: 12 },
                { id: "activity_1", number: 1 },
            ],
            ["activity_1", "activity_12"],
        );

        expect(assignments).toEqual([
            { id: "activity_1", number: 1 },
            { id: "activity_12", number: 12 },
        ]);
    });

    it("consumes each snapshot entry at most once", () => {
        const assignments = restoredNumberAssignments(
            [{ id: "a", number: 1 }],
            ["a", "a"],
        );

        expect(assignments).toEqual([{ id: "a", number: 1 }]);
    });

    it("skips live activities without a snapshot entry", () => {
        expect(
            restoredNumberAssignments([{ id: "a", number: 1 }], ["b"]),
        ).toEqual([]);
    });

    it("restores 'had no number' as undefined", () => {
        expect(restoredNumberAssignments([{ id: "a" }], ["a"])).toEqual([
            { id: "a", number: undefined },
        ]);
    });
});

describe("activitiesFromActors", () => {
    const activity = (
        id: string,
        sourceType: string,
        number?: number | null,
    ) => ({
        id,
        source: { type: sourceType },
        businessObject: { number },
    });

    it("keeps only activities whose source is an actor", () => {
        const fromActor = activity("a", ElementTypes.ACTOR + "Person", 1);
        const fromWorkObject = activity(
            "b",
            ElementTypes.WORKOBJECT + "Document",
            2,
        );

        expect(activitiesFromActors([fromActor, fromWorkObject])).toEqual([
            fromActor,
        ]);
    });

    it("sorts ascending by activity number", () => {
        const first = activity("a", ElementTypes.ACTOR + "Person", 1);
        const second = activity("b", ElementTypes.ACTOR + "Person", 2);
        const third = activity("c", ElementTypes.ACTOR + "Person", 3);

        expect(activitiesFromActors([third, first, second])).toEqual([
            first,
            second,
            third,
        ]);
    });

    it("does not mutate the input array", () => {
        const input = [
            activity("b", ElementTypes.ACTOR + "Person", 2),
            activity("a", ElementTypes.ACTOR + "Person", 1),
        ];
        const inputBefore = [...input];

        activitiesFromActors(input);

        expect(input).toEqual(inputBefore);
    });

    it("drops activities without a source", () => {
        expect(
            activitiesFromActors([
                { id: "a", source: null, businessObject: { number: 1 } },
            ]),
        ).toEqual([]);
    });
});
