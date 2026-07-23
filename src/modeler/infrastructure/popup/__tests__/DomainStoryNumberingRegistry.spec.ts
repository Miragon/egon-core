import { describe, expect, it, vi } from "vitest";
import { DomainStoryNumberingRegistry } from "../DomainStoryNumberingRegistry";
import type EventBus from "diagram-js/lib/core/EventBus";
import type CommandStack from "diagram-js/lib/command/CommandStack";
import type { Element } from "diagram-js/lib/model/Types";
import type { ElementRegistryService } from "../../../service/ElementRegistryService";

/**
 * The registry has no host dependencies for the behavior under test, so the
 * collaborators are reduced to the single method each code path touches:
 * `getActivitiesFromActors` feeds the numbering algorithm, `execute` absorbs the
 * deferred `activity.changed` commands so their timers stay harmless.
 */
function makeRegistry(
    activitiesFromActors: unknown[],
): ElementRegistryService {
    return {
        getActivitiesFromActors: () => activitiesFromActors,
    } as unknown as ElementRegistryService;
}

/** A minimal actor activity carrying only the number the algorithm reads. */
const activityWithNumber = (number: number) => ({ businessObject: { number } });

/** Builds a registry with the given collaborators wired in. */
function makeSut(activitiesFromActors: unknown[] = []) {
    const eventBus = {} as unknown as EventBus;
    const commandStack = { execute: vi.fn() } as unknown as CommandStack;
    return new DomainStoryNumberingRegistry(
        eventBus,
        commandStack,
        makeRegistry(activitiesFromActors),
    );
}

describe("DomainStoryNumberingRegistry", () => {
    describe("generateAutomaticNumber", () => {
        it("picks the lowest free number when the sequence has a gap", () => {
            const registry = makeSut([
                activityWithNumber(1),
                activityWithNumber(3),
            ]);
            const element = { businessObject: {} } as unknown as Element;

            const result = registry.generateAutomaticNumber(element);

            expect(result).toBe(2);
            expect(element.businessObject.number).toBe(2);
        });

        it("falls back to usedNumbers.length when the sequence is contiguous", () => {
            const registry = makeSut([
                activityWithNumber(1),
                activityWithNumber(2),
            ]);
            const element = { businessObject: {} } as unknown as Element;

            const result = registry.generateAutomaticNumber(element);

            // usedNumbers = [0, 1, 2] has no gap, so the next number is its length
            expect(result).toBe(3);
            expect(element.businessObject.number).toBe(3);
        });

        it("returns 1 for the first activity when none exist yet", () => {
            const registry = makeSut([]);
            const element = { businessObject: {} } as unknown as Element;

            expect(registry.generateAutomaticNumber(element)).toBe(1);
        });
    });

    describe("isNumberMultiple", () => {
        it("reflects the flag set via setNumberIsMultiple", () => {
            const registry = makeSut();

            registry.setNumberIsMultiple(5, true);
            expect(registry.isNumberMultiple(5)).toBe(true);

            registry.setNumberIsMultiple(5, false);
            expect(registry.isNumberMultiple(5)).toBe(false);
        });

        it("defaults to false for indices that were never set", () => {
            expect(makeSut().isNumberMultiple(99)).toBe(false);
        });
    });
});
