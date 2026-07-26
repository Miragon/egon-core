import { describe, expect, it, vi } from "vitest";
import { ActivityChangedHandler } from "../activityUpdateHandler";
import type EventBus from "diagram-js/lib/core/EventBus";
import type { CommandContext } from "diagram-js/lib/command/CommandStack";
import type { ElementRegistryService } from "../../../../service/ElementRegistryService";
import { DomainStoryNumberingRegistry } from "../../../popup/DomainStoryNumberingRegistry";

/**
 * `activity.changed` as one transaction (issue #68): the handler owns the edit,
 * the renumbering cascade and the multiple-number flags, so all three survive
 * undo *and* redo.
 *
 * WHY a real `DomainStoryNumberingRegistry` instead of a mock: the cascade is
 * the thing under test. A mocked registry would only prove the handler calls a
 * method — the defects this spec locks (a snapshot taken after the edit, a redo
 * that skips the cascade, an aliased flag snapshot) all live in the interaction
 * between the two. No canvas is involved, so this stays unit tier (ADR 0014).
 */
const activity = (id: string, number: number | undefined, name = "") => ({
    id,
    businessObject: { id, number, name, multipleNumberAllowed: false },
});

/**
 * The element registry stub re-sorts on every call, exactly as the real
 * `activitiesFromActors` does, so the handler sees the story order it would see
 * on a live canvas.
 */
function makeSut(activitiesFromActors: ReturnType<typeof activity>[]) {
    const eventBus = { fire: vi.fn() } as unknown as EventBus;
    const elementRegistryService = {
        getActivitiesFromActors: () =>
            [...activitiesFromActors].sort(
                (activityA, activityB) =>
                    Number(activityA.businessObject.number) -
                    Number(activityB.businessObject.number),
            ),
    } as unknown as ElementRegistryService;
    const numberingRegistry = new DomainStoryNumberingRegistry(
        eventBus,
        elementRegistryService,
    );
    const handler = new ActivityChangedHandler(
        elementRegistryService,
        eventBus,
        numberingRegistry,
    );
    return { handler, eventBus, numberingRegistry };
}

/** The context `DomainStoryPopupService.handleUpdate` builds, nothing more. */
function editContext(
    edited: ReturnType<typeof activity>,
    options: {
        newLabel: string;
        newNumber?: number;
        newMultipleNumberAllowed?: boolean;
    },
): CommandContext {
    return {
        businessObject: edited.businessObject,
        element: edited,
        newLabel: options.newLabel,
        newNumber: options.newNumber,
        newMultipleNumberAllowed: options.newMultipleNumberAllowed ?? false,
    } as unknown as CommandContext;
}

const numbersOf = (activities: ReturnType<typeof activity>[]) =>
    activities.map((each) => each.businessObject.number);

describe("ActivityChangedHandler", () => {
    describe("preExecute", () => {
        // T3.1 — the headline bug: the popup used to write the new number onto
        // the business object before executing, so the snapshot recorded the
        // *new* number and undo left the edited activity where the edit put it.
        it("snapshots the number the activity had before the edit", () => {
            const edited = activity("a3", 3);
            const { handler } = makeSut([activity("a1", 1), edited]);
            const context = editContext(edited, {
                newLabel: "third",
                newNumber: 1,
            });

            handler.preExecute!(context);

            expect(context.oldNumber).toBe(3);
        });

        // T3.2 — no nested `modeling.updateLabel`/`updateNumber` any more; those
        // pushed their own actions and gave their reverts the last word.
        it("leaves the model untouched", () => {
            const edited = activity("a3", 3, "old label");
            const { handler } = makeSut([edited]);

            handler.preExecute!(
                editContext(edited, { newLabel: "third", newNumber: 1 }),
            );

            expect(edited.businessObject.name).toBe("old label");
            expect(edited.businessObject.number).toBe(3);
        });
    });

    describe("execute", () => {
        // T3.3
        it("claims the number and moves the other activities out of the way", () => {
            const first = activity("a1", 1);
            const second = activity("a2", 2);
            const edited = activity("a3", 3);
            const { handler } = makeSut([first, second, edited]);
            const context = editContext(edited, {
                newLabel: "third",
                newNumber: 1,
            });

            handler.preExecute!(context);
            handler.execute!(context);

            expect(numbersOf([edited, first, second])).toEqual([1, 2, 3]);
            expect(edited.businessObject.name).toBe("third");
        });

        // T3.4 — defect 2's lock. diagram-js' redo re-runs `execute` alone, so a
        // cascade living outside it (as it did in the popup) is not re-applied
        // and the duplicate numbers come back.
        it("re-applies the whole cascade on redo", () => {
            const first = activity("a1", 1);
            const second = activity("a2", 2);
            const edited = activity("a3", 3);
            const { handler } = makeSut([first, second, edited]);
            const context = editContext(edited, {
                newLabel: "third",
                newNumber: 1,
            });

            handler.preExecute!(context);
            handler.execute!(context);
            const afterFirstExecute = numbersOf([edited, first, second]);

            handler.revert!(context);
            // The same context object, as the command stack replays it.
            handler.execute!(context);

            expect(numbersOf([edited, first, second])).toEqual(
                afterFirstExecute,
            );
        });

        // T3.5 — the flag snapshot must survive being restored and re-cascaded.
        it("returns the registry flags to their pre-edit values across undo→redo→undo", () => {
            const first = activity("a1", 1);
            const edited = activity("a2", 2);
            const { handler, numberingRegistry } = makeSut([first, edited]);
            numberingRegistry.setNumberIsMultiple(1, true);
            const context = editContext(edited, {
                newLabel: "second",
                newNumber: 1,
            });

            handler.preExecute!(context);
            handler.execute!(context);
            handler.revert!(context);
            handler.execute!(context);
            handler.revert!(context);

            expect(numberingRegistry.isNumberMultiple(1)).toBe(true);
            expect(numberingRegistry.isNumberMultiple(2)).toBe(false);
        });

        // T3.6 — `PopupMenu` reports an empty number field as 0 and the popup
        // maps it to undefined; cascading from a falsy number would walk the
        // registry from its sentinel slot.
        it("runs no cascade when the edit carries no number", () => {
            const first = activity("a1", 1);
            const edited = activity("a2", 2);
            const { handler, numberingRegistry } = makeSut([first, edited]);
            const before = numberingRegistry.snapshotMultipleNumberRegistry();
            const context = editContext(edited, { newLabel: "second" });

            handler.preExecute!(context);
            handler.execute!(context);

            expect(first.businessObject.number).toBe(1);
            expect(edited.businessObject.number).toBeUndefined();
            expect(numberingRegistry.snapshotMultipleNumberRegistry()).toEqual(
                before,
            );
        });

        it("records the multiple-number allowance on the model and the registry", () => {
            const first = activity("a1", 1);
            const edited = activity("a2", 2);
            const { handler, numberingRegistry } = makeSut([first, edited]);
            const context = editContext(edited, {
                newLabel: "second",
                newNumber: 1,
                newMultipleNumberAllowed: true,
            });

            handler.preExecute!(context);
            handler.execute!(context);

            // Sharing a number is the point of the allowance, so nothing moves.
            expect(numbersOf([edited, first])).toEqual([1, 1]);
            expect(edited.businessObject.multipleNumberAllowed).toBe(true);
            expect(numberingRegistry.isNumberMultiple(1)).toBe(true);
        });
    });

    describe("revert", () => {
        // T3.7
        it("restores the edited activity's own number, label and allowance", () => {
            const first = activity("a1", 1);
            const second = activity("a2", 2);
            const edited = activity("a3", 3, "third");
            const { handler } = makeSut([first, second, edited]);
            const context = editContext(edited, {
                newLabel: "edited",
                newNumber: 1,
                newMultipleNumberAllowed: true,
            });

            handler.preExecute!(context);
            handler.execute!(context);
            handler.revert!(context);

            expect(numbersOf([first, second, edited])).toEqual([1, 2, 3]);
            expect(edited.businessObject.name).toBe("third");
            expect(edited.businessObject.multipleNumberAllowed).toBe(false);
        });

        it("restores snapshot numbers even when one activity id prefixes another", () => {
            const short = activity("activity_1", 7);
            const long = activity("activity_12", 8);
            const edited = activity("activity_edited", 9);
            const { handler, eventBus } = makeSut([short, long]);

            handler.revert!({
                businessObject: edited.businessObject,
                element: edited,
                oldLabel: "label",
                oldNumber: 3,
                oldMultipleNumberAllowed: false,
                oldMultipleNumberRegistry: [false],
                oldNumbersWithIDs: [
                    { id: "activity_12", number: 2 },
                    { id: "activity_1", number: 1 },
                ],
            } as unknown as CommandContext);

            expect(short.businessObject.number).toBe(1);
            expect(long.businessObject.number).toBe(2);
            expect(edited.businessObject.number).toBe(3);
            expect(eventBus.fire).toHaveBeenCalledWith("element.changed", {
                element: short,
            });
            expect(eventBus.fire).toHaveBeenCalledWith("element.changed", {
                element: long,
            });
        });

        it("leaves activities without a snapshot entry untouched", () => {
            const unrelated = activity("activity_new", 5);
            const edited = activity("activity_edited", 9);
            const { handler } = makeSut([unrelated]);

            handler.revert!({
                businessObject: edited.businessObject,
                element: edited,
                oldLabel: "label",
                oldNumber: 9,
                oldMultipleNumberAllowed: false,
                oldMultipleNumberRegistry: [false],
                oldNumbersWithIDs: [],
            } as unknown as CommandContext);

            expect(unrelated.businessObject.number).toBe(5);
        });
    });
});
