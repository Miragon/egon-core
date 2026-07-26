import { describe, expect, it, vi } from "vitest";
import { ActivityChangedHandler } from "../activityUpdateHandler";
import type EventBus from "diagram-js/lib/core/EventBus";
import type { CommandContext } from "diagram-js/lib/command/CommandStack";
import type { ElementRegistryService } from "../../../../service/ElementRegistryService";
import type { DomainStoryModeling } from "../../../modeling/DomainStoryModeling";
import type { DomainStoryNumberingRegistry } from "../../../popup/DomainStoryNumberingRegistry";

/**
 * Covers the undo path of `activity.changed`: reverting must restore every
 * activity's number from the pre-command snapshot. This is the regression lock
 * for the former `j = -5` splice + substring-id matching, which corrupted the
 * snapshot bookkeeping and restored wrong numbers as soon as one activity id
 * prefixed another.
 */
const activity = (id: string, number: number) => ({
    businessObject: { id, number },
});

function makeSut(activitiesFromActors: unknown[]) {
    const eventBus = { fire: vi.fn() } as unknown as EventBus;
    const handler = new ActivityChangedHandler(
        {} as DomainStoryModeling,
        {
            getActivitiesFromActors: () => activitiesFromActors,
        } as unknown as ElementRegistryService,
        eventBus,
        {} as DomainStoryNumberingRegistry,
    );
    return { handler, eventBus };
}

describe("ActivityChangedHandler", () => {
    describe("revert", () => {
        it("restores snapshot numbers even when one activity id prefixes another", () => {
            const short = activity("activity_1", 7);
            const long = activity("activity_12", 8);
            const edited = activity("activity_edited", 9);
            const { handler, eventBus } = makeSut([short, long]);

            handler.revert({
                businessObject: edited.businessObject,
                element: edited,
                oldLabel: "label",
                oldNumber: 3,
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

            handler.revert({
                businessObject: edited.businessObject,
                element: edited,
                oldLabel: "label",
                oldNumber: 9,
                oldNumbersWithIDs: [],
            } as unknown as CommandContext);

            expect(unrelated.businessObject.number).toBe(5);
        });
    });
});
