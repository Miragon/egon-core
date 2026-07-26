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
import type { ActivityCanvasObject } from "../../../../story/domain/canvasObject";
import type { ElementRegistryService } from "../../../service/ElementRegistryService";
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
     * Replays `DomainStoryPopupService.handleUpdate` — the only production caller
     * of `activity.changed`. Reproduced here rather than invoked because `open()`
     * needs a `#egon-io-container` in the host document and a real dblclick; the
     * *context shape* and the pre/post-execute ordering are what the handler and
     * the numbering registry actually contract on, so they are mirrored exactly,
     * including the pre-execute mutation of `businessObject.number`.
     */
    function editActivityThroughPopupFlow(
        modeler: TestModeler,
        activity: Connection,
        options: { label: string; number?: number; isMultiple?: boolean },
    ): void {
        const registryService = modeler.get<ElementRegistryService>(
            "domainStoryElementRegistryService",
        );
        const numberingRegistry = modeler.get<DomainStoryNumberingRegistry>(
            "domainStoryNumberingRegistry",
        );
        const { label, number, isMultiple = false } = options;

        const otherActivities = registryService.getActivitiesFromActors();
        otherActivities.splice(
            otherActivities.indexOf(
                activity as unknown as ActivityCanvasObject,
            ),
            1,
        );

        if (number) {
            activity.businessObject.number = number;
            numberingRegistry.setNumberIsMultiple(number, isMultiple);
        }
        activity.businessObject.multipleNumberAllowed = isMultiple;

        modeler.commandStack.execute("activity.changed", {
            businessObject: activity.businessObject,
            newLabel: label,
            newNumber: number,
            element: activity,
        });

        if (!number) {
            return;
        }
        // The registry is told the number is "multiple" *before* this check, so
        // asking for multiple always short-circuits the cascade.
        if (
            activity.businessObject.multipleNumberAllowed &&
            numberingRegistry.isNumberMultiple(number)
        ) {
            return;
        }
        numberingRegistry.updateExistingNumbersAtEditing(
            otherActivities,
            number,
        );
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
        });

        it("undo restores the numbers the cascade moved, not just the edited one", () => {
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

            // This is the whole point of `oldNumbersWithIDs` /
            // `restoredNumberAssignments`: the command only names one element, so
            // without the snapshot the two *cascaded* activities would keep the
            // numbers the cascade gave them.
            expect([numberOf(first), numberOf(second)]).toEqual([1, 2]);
            // The empty original name comes back, not `preExecute`'s `" "`
            // fallback: `updateLabel` runs as a nested command, so its own revert
            // fires after the outer handler's and has the last word.
            expect(third.businessObject.name).toBe("");
            // NOTE: the edited activity's own number is deliberately not asserted
            // here — it is not restored. `DomainStoryPopupService.handleUpdate`
            // assigns `businessObject.number` *before* `commandStack.execute`, so
            // `ActivityChangedHandler.preExecute` snapshots the new number as
            // `oldNumber`. Reported as a suspected bug rather than pinned, so a
            // fix does not have to edit this spec.
        });

        it("suppresses the cascade when the number may occur multiple times", () => {
            const modeler = boot();
            const { actor, workObjects } = addStoryCast(modeler, 3);
            const [first, second, third] = workObjects.map((workObject) =>
                connect(modeler, actor, workObject)!,
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
            expect(
                modeler
                    .get<DomainStoryNumberingRegistry>(
                        "domainStoryNumberingRegistry",
                    )
                    .isNumberMultiple(1),
            ).toBe(true);
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
