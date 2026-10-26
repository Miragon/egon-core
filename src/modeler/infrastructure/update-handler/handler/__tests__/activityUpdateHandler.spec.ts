import { describe, expect, it, vi } from "vitest";
import {
    ActivityChangedHandler,
    ActivityDirectionChangedHandler,
} from "../activityUpdateHandler";
import type EventBus from "diagram-js/lib/core/EventBus";
import type { CommandContext } from "diagram-js/lib/command/CommandStack";
import type { Connection, Element } from "diagram-js/lib/model/Types";
import type { ElementRegistryService } from "../../../../service/ElementRegistryService";
import { DomainStoryNumberingRegistry } from "../../../popup/DomainStoryNumberingRegistry";

/**
 * A real `DomainStoryNumberingRegistry`, not a mock: the cascade between handler
 * and registry is what is under test. No canvas, so unit tier (ADR TST-2).
 */
const activity = (
    id: string,
    number: number | undefined,
    name = "",
    // An activity is a numbered step only when its source is an actor; undefined
    // by default so nothing re-mints a number.
    source?: { type: string },
) => ({
    id,
    source,
    businessObject: { id, number, name, multipleNumberAllowed: false },
});

/** A source shape that makes its activity a numbered story step. */
const ACTOR_SOURCE = { type: "domainStory:actorPerson" };

/** The stub re-sorts on every call, like the real `activitiesFromActors`. */
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

        // diagram-js' redo re-runs `execute` alone, so the cascade must live there.
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

        // A cascade from a falsy number would start at the sentinel slot.
        it("runs no cascade when the edit carries no number", () => {
            const first = activity("a1", 1);
            const edited = activity("a2", 2);
            const { handler, numberingRegistry } = makeSut([first, edited]);
            const before = numberingRegistry.snapshotMultipleNumberRegistry();
            const context = editContext(edited, { newLabel: "second" });

            handler.preExecute!(context);
            handler.execute!(context);

            expect(first.businessObject.number).toBe(1);
            // `null`, not `undefined`: `JSON.stringify` drops `undefined`, and
            // every file writes `"number": null` for an unnumbered activity.
            expect(edited.businessObject.number).toBeNull();
            expect(numberingRegistry.snapshotMultipleNumberRegistry()).toEqual(
                before,
            );
        });

        it("re-mints a number when an actor-sourced activity's field is cleared", () => {
            const first = activity("a1", 1, "", ACTOR_SOURCE);
            const third = activity("a3", 3, "", ACTOR_SOURCE);
            const edited = activity("a2", 2, "", ACTOR_SOURCE);
            const { handler } = makeSut([first, edited, third]);
            const context = editContext(edited, { newLabel: "second" });

            handler.preExecute!(context);
            handler.execute!(context);

            // Clearing frees 2, so getting 2 back proves the mint read the
            // registry after the clear.
            expect(edited.businessObject.number).toBe(2);
            expect(numbersOf([first, third])).toEqual([1, 3]);

            handler.revert!(context);

            expect(edited.businessObject.number).toBe(2);
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

type TestWaypoint = {
    x: number;
    y: number;
    original?: { x: number; y: number };
};

function directionContext(
    element: Connection,
    newNumber: number | null,
): CommandContext {
    return {
        businessObject: element.businessObject,
        element,
        newNumber,
    } as unknown as CommandContext;
}

function directionActivity(waypoints: TestWaypoint[]): Connection {
    const source = { id: "actor_1" } as Element;
    const target = { id: "work_object_1" } as Element;
    const businessObject = {
        id: "activity_1",
        source: source.id,
        target: target.id,
        number: 1,
        waypoints,
    };

    return {
        id: businessObject.id,
        source,
        target,
        waypoints,
        businessObject,
    } as unknown as Connection;
}

describe("ActivityDirectionChangedHandler", () => {
    it.each([
        {
            name: "straight activity",
            waypoints: [
                { x: 150, y: 200, original: { x: 140, y: 200 } },
                { x: 550, y: 200, original: { x: 560, y: 200 } },
            ],
        },
        {
            name: "activity with bendpoints",
            waypoints: [
                { x: 150, y: 200, original: { x: 140, y: 200 } },
                { x: 300, y: 320 },
                { x: 450, y: 320 },
                { x: 550, y: 200, original: { x: 560, y: 200 } },
            ],
        },
    ])(
        "keeps complete persisted geometry synchronized through execute → undo → redo → undo ($name)",
        ({ waypoints }) => {
            const eventBus = { fire: vi.fn() } as unknown as EventBus;
            const handler = new ActivityDirectionChangedHandler(eventBus);
            const element = directionActivity(waypoints);
            const originalArray = element.waypoints;
            const originalPoints = originalArray.map((point) => point);
            const originalGeometry = structuredClone(waypoints);
            const context = directionContext(element, null);

            handler.preExecute!(context);
            handler.execute!(context);

            expect(element.source?.id).toBe("work_object_1");
            expect(element.target?.id).toBe("actor_1");
            expect(element.businessObject.source).toBe("work_object_1");
            expect(element.businessObject.target).toBe("actor_1");
            expect(element.waypoints).toEqual([...originalGeometry].reverse());
            expect(element.businessObject.waypoints).toEqual(
                [...originalGeometry].reverse(),
            );
            expect(element.waypoints).not.toBe(originalArray);
            expect(element.businessObject.waypoints).not.toBe(
                element.waypoints,
            );
            // The undo snapshot must survive reversal unmutated.
            expect(originalArray).toEqual(originalGeometry);
            expect(originalArray).toEqual(originalPoints);
            const liveWaypoints = element.waypoints as TestWaypoint[];
            const persistedWaypoints = element.businessObject
                .waypoints as TestWaypoint[];
            liveWaypoints.forEach((point, index) => {
                expect(persistedWaypoints[index]).not.toBe(point);
                if (point.original) {
                    expect(persistedWaypoints[index].original).not.toBe(
                        point.original,
                    );
                }
            });

            handler.revert!(context);
            expect(element.source?.id).toBe("actor_1");
            expect(element.target?.id).toBe("work_object_1");
            expect(element.businessObject.source).toBe("actor_1");
            expect(element.businessObject.target).toBe("work_object_1");
            expect(element.waypoints).toEqual(originalGeometry);
            expect(element.businessObject.waypoints).toEqual(originalGeometry);
            expect(element.businessObject.waypoints).not.toBe(
                element.waypoints,
            );

            handler.execute!(context);
            expect(element.waypoints).toEqual([...originalGeometry].reverse());
            expect(element.businessObject.waypoints).toEqual(
                [...originalGeometry].reverse(),
            );

            handler.revert!(context);
            expect(element.source?.id).toBe("actor_1");
            expect(element.target?.id).toBe("work_object_1");
            expect(element.businessObject.waypoints).toEqual(originalGeometry);
        },
    );

    it("restores the original direction after two consecutive changes", () => {
        const eventBus = { fire: vi.fn() } as unknown as EventBus;
        const handler = new ActivityDirectionChangedHandler(eventBus);
        const element = directionActivity([
            { x: 150, y: 200, original: { x: 140, y: 200 } },
            { x: 300, y: 320 },
            { x: 550, y: 200, original: { x: 560, y: 200 } },
        ]);
        const expected = structuredClone(element.waypoints);

        const first = directionContext(element, null);
        handler.preExecute!(first);
        handler.execute!(first);

        const second = directionContext(element, 7);
        handler.preExecute!(second);
        handler.execute!(second);

        expect(element.source?.id).toBe("actor_1");
        expect(element.target?.id).toBe("work_object_1");
        expect(element.businessObject.source).toBe("actor_1");
        expect(element.businessObject.target).toBe("work_object_1");
        expect(element.waypoints).toEqual(expected);
        expect(element.businessObject.waypoints).toEqual(expected);
        expect(element.businessObject.waypoints).not.toBe(element.waypoints);
    });
});
