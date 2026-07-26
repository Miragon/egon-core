import { afterEach, describe, expect, it, vi } from "vitest";
import type { Connection, Shape } from "diagram-js/lib/model/Types";

import {
    createTestModeler,
    type TestModeler,
} from "../../../../__tests__/helpers/createTestModeler";
import {
    addActor,
    addWorkObject,
    connect,
} from "../../../../__tests__/helpers/storyBuilder";
import type { DomainStoryNumberingRegistry } from "../DomainStoryNumberingRegistry";

/**
 * Automatic activity numbering, end to end (issue #55).
 *
 * WHY this cannot be a unit spec: numbering is not in a command handler. A new
 * activity gets its number inside `DomainStoryRenderer.renderExternalNumber`,
 * reached from `drawActivity` — so only a real *draw pass* assigns it, and the
 * numbers are the product of renderer, `DomainStoryNumberingRegistry`,
 * `ElementRegistryService` and `ActivityChangedHandler` agreeing. Mocking any of
 * them tests the mock. The pure arithmetic already has its own spec
 * (`story/domain/__tests__` for `activityNumbering`); this spec proves the wiring.
 *
 * WHY browser tier (ADR 0014): the draw pass is the point. `canvas.addConnection`
 * reaches tiny-svg `translate()` → `SVGSVGElement.createSVGTransform`, and the
 * number is laid out with `getBBox` — neither exists in jsdom, so in the unit
 * tier no activity is ever drawn and no number is ever generated.
 */
describe("activity numbering (browser)", () => {
    let modelers: TestModeler[] = [];

    afterEach(() => {
        modelers.forEach((modeler) => modeler.cleanup());
        modelers = [];
        vi.restoreAllMocks();
    });

    /** Registers the modeler for teardown; leaked canvases are what cost time. */
    function boot(): TestModeler {
        const modeler = createTestModeler();
        modelers.push(modeler);
        return modeler;
    }

    /** One actor plus `count` work objects, vertically spread so nothing overlaps. */
    function addStoryCast(
        modeler: TestModeler,
        count: number,
    ): { actor: Shape; workObjects: Shape[] } {
        const actor = addActor(modeler, { point: { x: 120, y: 120 } });
        const workObjects = Array.from({ length: count }, (_unused, index) =>
            addWorkObject(modeler, { point: { x: 450, y: 120 + index * 120 } }),
        );
        return { actor, workObjects };
    }

    function numberOf(activity: Connection): number | null | undefined {
        return activity.businessObject.number;
    }

    /**
     * The context `DomainStoryPopupService.handleUpdate` builds — and, since
     * #68, all it builds. The popup no longer touches the model and no longer
     * runs the cascade; `ActivityChangedHandler` owns the whole transaction, so
     * everything here is undoable and redoable as one action. Reproduced rather
     * than driven through `open()` because that needs a `#egon-io-container` in
     * the host document and a real dblclick; the context shape is the contract.
     */
    function editActivityThroughPopupFlow(
        modeler: TestModeler,
        activity: Connection,
        options: { label: string; number?: number; isMultiple?: boolean },
    ): void {
        const { label, number, isMultiple = false } = options;

        modeler.commandStack.execute("activity.changed", {
            businessObject: activity.businessObject,
            element: activity,
            newLabel: label,
            newNumber: number,
            newMultipleNumberAllowed: isMultiple,
        });
    }

    describe("automatic numbers", () => {
        it("numbers the first activity 1 during its draw pass", () => {
            const modeler = boot();
            const { actor, workObjects } = addStoryCast(modeler, 1);

            const activity = connect(modeler, actor, workObjects[0])!;

            // No further command ran — creating the connection drew it, and the
            // draw is what assigned the number.
            expect(numberOf(activity)).toBe(1);
            // Visible proof that the number came from the renderer, not a handler.
            const gfx = modeler.container.querySelector(
                `[data-element-id="${activity.id}"]`,
            )!;
            expect(
                Array.from(gfx.querySelectorAll("text")).map(
                    (text) => text.textContent,
                ),
            ).toContain("1");
        });

        it("counts up for each following activity from an actor", () => {
            const modeler = boot();
            const { actor, workObjects } = addStoryCast(modeler, 3);

            const numbers = workObjects.map((workObject) =>
                numberOf(connect(modeler, actor, workObject)!),
            );

            expect(numbers).toEqual([1, 2, 3]);
        });

        it("refills the gap a deleted activity leaves before growing", () => {
            const modeler = boot();
            const { actor, workObjects } = addStoryCast(modeler, 3);
            const activities = workObjects.map((workObject) =>
                connect(modeler, actor, workObject)!,
            );

            modeler.modeling.removeConnection(activities[1]);
            const replacement = connect(modeler, actor, workObjects[1])!;

            // `nextAvailableActivityNumber` returns the smallest unused positive
            // integer, so the freed 2 is reused rather than a fourth number added.
            expect(numberOf(replacement)).toBe(2);
            expect([
                numberOf(activities[0]),
                numberOf(replacement),
                numberOf(activities[2]),
            ]).toEqual([1, 2, 3]);
        });

        it("leaves a work object→work object activity unnumbered", () => {
            const modeler = boot();
            const { actor, workObjects } = addStoryCast(modeler, 2);
            const numbered = connect(modeler, actor, workObjects[0])!;

            const response = connect(modeler, workObjects[0], workObjects[1])!;

            // Only an activity whose *source* is an actor is a story step; the
            // renderer explicitly nulls the number on every other activity.
            expect(numberOf(response)).toBeNull();
            expect(numberOf(numbered)).toBe(1);
            // …and it stays out of the sequence, so the next step is 2, not 3.
            const nextStep = connect(modeler, actor, workObjects[1])!;
            expect(numberOf(nextStep)).toBe(2);
        });
    });

    describe("activity.changed", () => {
        it("cascades the occupants upward when an occupied number is claimed", () => {
            const modeler = boot();
            const { actor, workObjects } = addStoryCast(modeler, 3);
            const [first, second, third] = workObjects.map((workObject) =>
                connect(modeler, actor, workObject)!,
            );

            editActivityThroughPopupFlow(modeler, third, {
                label: "third",
                number: 1,
            });

            // Every occupied number ≥ 1 moves up one slot, so the edited activity
            // owns 1 without duplicating it.
            expect([
                numberOf(third),
                numberOf(first),
                numberOf(second),
            ]).toEqual([1, 2, 3]);
            expect(third.businessObject.name).toBe("third");
            expect(third.businessObject.multipleNumberAllowed).toBe(false);
        });

        it("undo and redo move the whole edit, cascade included", () => {
            const modeler = boot();
            const { actor, workObjects } = addStoryCast(modeler, 3);
            const [first, second, third] = workObjects.map((workObject) =>
                connect(modeler, actor, workObject)!,
            );

            editActivityThroughPopupFlow(modeler, third, {
                label: "third",
                number: 1,
            });
            modeler.commandStack.undo();

            // The cascade revert is what `oldNumbersWithIDs` /
            // `restoredNumberAssignments` exist for: the command names one
            // element, so without the snapshot the two *cascaded* activities
            // would keep the numbers the cascade gave them.
            expect([numberOf(first), numberOf(second)]).toEqual([1, 2]);
            // …and the edited activity comes back too (#68). It used to keep the
            // number the edit gave it, because the popup wrote it onto the model
            // before `preExecute` could snapshot the old one — leaving two
            // activities numbered 1 after an undo.
            expect(numberOf(third)).toBe(3);
            expect(third.businessObject.name).toBe("");

            modeler.commandStack.redo();

            // Redo re-runs `execute` only. With the cascade outside the command
            // it re-applied the edited element alone and the duplicates returned.
            expect([
                numberOf(third),
                numberOf(first),
                numberOf(second),
            ]).toEqual([1, 2, 3]);
            expect(third.businessObject.name).toBe("third");

            // A second undo has to land in the same place as the first — the
            // command's snapshots must survive being replayed.
            modeler.commandStack.undo();

            expect([
                numberOf(first),
                numberOf(second),
                numberOf(third),
            ]).toEqual([1, 2, 3]);
        });

        it("suppresses the cascade when the number may occur multiple times", () => {
            const modeler = boot();
            const { actor, workObjects } = addStoryCast(modeler, 3);
            const [first, second, third] = workObjects.map((workObject) =>
                connect(modeler, actor, workObject)!,
            );
            const numberingRegistry = modeler.get<DomainStoryNumberingRegistry>(
                "domainStoryNumberingRegistry",
            );

            editActivityThroughPopupFlow(modeler, third, {
                label: "third",
                number: 1,
                isMultiple: true,
            });

            // Two activities sharing number 1 is the *point* of the multiple-number
            // allowance (one actor doing the same step to several work objects).
            expect([
                numberOf(third),
                numberOf(first),
                numberOf(second),
            ]).toEqual([1, 1, 2]);
            expect(numberingRegistry.isNumberMultiple(1)).toBe(true);

            modeler.commandStack.undo();

            // The registry flag is part of the transaction now; it used to be set
            // from the popup, outside the command, and so survived every undo.
            expect(numberingRegistry.isNumberMultiple(1)).toBe(false);
            // `undefined`, not `false`: a freshly drawn activity carries no such
            // field, and the revert restores the value `preExecute` saw rather
            // than normalizing one in. Writing `false` would put a key into the
            // exported bytes that undoing an edit has no business adding.
            expect(third.businessObject.multipleNumberAllowed).toBeUndefined();

            modeler.commandStack.redo();

            expect(numberingRegistry.isNumberMultiple(1)).toBe(true);
            expect(third.businessObject.multipleNumberAllowed).toBe(true);
        });

        it("leaves the actor sequence alone when a response arrow is edited", () => {
            const modeler = boot();
            const { actor, workObjects } = addStoryCast(modeler, 2);
            const [first, second] = workObjects.map((workObject) =>
                connect(modeler, actor, workObject)!,
            );
            const response = connect(modeler, workObjects[0], workObjects[1])!;

            // A work-object-sourced activity renders no number input, so the
            // popup always submits `newNumber: undefined` for it — which is why
            // the `splice(indexOf(...) === -1, 1)` defect this guards against was
            // never reachable through the UI. Its real lock is the domain case
            // "excludes the edited activity from its own cascade"; this one
            // covers the non-actor / `oldNumber == null` path end to end.
            editActivityThroughPopupFlow(modeler, response, {
                label: "response",
            });

            expect([numberOf(first), numberOf(second)]).toEqual([1, 2]);
            expect(numberOf(response)).toBeNull();
            expect(response.businessObject.name).toBe("response");

            modeler.commandStack.undo();

            expect([numberOf(first), numberOf(second)]).toEqual([1, 2]);
            expect(response.businessObject.name).toBe("");
        });

        it("re-mints a number when the field is cleared, and undo restores the old one", () => {
            const modeler = boot();
            const { actor, workObjects } = addStoryCast(modeler, 3);
            const activities = workObjects.map((workObject) =>
                connect(modeler, actor, workObject)!,
            );
            // Leaves numbers {1, 3}, so a re-mint is visibly different from the
            // number that was cleared.
            modeler.modeling.removeConnection(activities[1]);

            editActivityThroughPopupFlow(modeler, activities[2], {
                label: "third",
            });

            // `execute` clears the number; the redraw that follows finds it null
            // and `renderExternalNumber` mints the lowest free one. Today's
            // behaviour, preserved.
            expect(numberOf(activities[2])).toBe(2);

            modeler.commandStack.undo();

            expect(numberOf(activities[2])).toBe(3);
        });
    });

    describe("multi-instance isolation (extends issue #12)", () => {
        it("numbers and mints ids per instance, with no pool shared", () => {
            // Pin the id factory's randomness so both instances *want* the same
            // ids. A shared pool would make the second instance skip past them —
            // which is exactly the leak issue #12 is about — so identical ids are
            // the proof of independence, and the registry lookups below show the
            // sameness is harmless.
            vi.spyOn(Math, "random").mockReturnValue(0.0001);

            const first = boot();
            const second = boot();

            const firstCast = addStoryCast(first, 2);
            const secondCast = addStoryCast(second, 1);

            const firstActivity = connect(
                first,
                firstCast.actor,
                firstCast.workObjects[0],
            )!;
            const secondActivity = connect(
                second,
                secondCast.actor,
                secondCast.workObjects[0],
            )!;
            const firstFollowUp = connect(
                first,
                firstCast.actor,
                firstCast.workObjects[1],
            )!;

            // Numbering: each instance counts its own story from 1.
            expect(numberOf(firstActivity)).toBe(1);
            expect(numberOf(secondActivity)).toBe(1);
            expect(numberOf(firstFollowUp)).toBe(2);

            // Ids: pristine pools hand out the same strings…
            expect(secondActivity.id).toBe(firstActivity.id);
            expect(secondCast.actor.id).toBe(firstCast.actor.id);
            // …and each registry still resolves that id to its own element, so
            // nothing crosses over.
            expect(first.elementRegistry.get(firstActivity.id)).toBe(
                firstActivity,
            );
            expect(second.elementRegistry.get(firstActivity.id)).toBe(
                secondActivity,
            );

            // A cascade in one instance must not touch the other.
            editActivityThroughPopupFlow(first, firstFollowUp, {
                label: "second step",
                number: 1,
            });

            expect(numberOf(firstFollowUp)).toBe(1);
            expect(numberOf(firstActivity)).toBe(2);
            expect(numberOf(secondActivity)).toBe(1);
        });
    });
});
