import { describe, expect, it, vi } from "vitest";
import { DomainStoryNumberingRegistry } from "../DomainStoryNumberingRegistry";
import type EventBus from "diagram-js/lib/core/EventBus";
import type { Element } from "diagram-js/lib/model/Types";
import type { ElementRegistryService } from "../../../service/ElementRegistryService";

/**
 * Adapter-level spec: the numbering arithmetic itself is covered exhaustively
 * in `story/domain/__tests__/activityNumbering.spec.ts`; here we only verify
 * that the registry wires domain results to the canvas — mutating business
 * objects, firing `element.changed`, and keeping the multiple-number state.
 */
function makeRegistry(activitiesFromActors: unknown[]): ElementRegistryService {
    return {
        getActivitiesFromActors: () => activitiesFromActors,
    } as unknown as ElementRegistryService;
}

/** A minimal actor activity carrying what the adapter reads: id and number. */
const activityWithNumber = (id: string, number?: number) => ({
    businessObject: { id, number },
});

/** Builds a registry with the given collaborators wired in. */
function makeSut(activitiesFromActors: unknown[] = []) {
    const eventBus = { fire: vi.fn() } as unknown as EventBus;
    const registry = new DomainStoryNumberingRegistry(
        eventBus,
        makeRegistry(activitiesFromActors),
    );
    return { registry, eventBus };
}

describe("DomainStoryNumberingRegistry", () => {
    describe("generateAutomaticNumber", () => {
        it("assigns and returns the lowest free number", () => {
            const { registry } = makeSut([
                activityWithNumber("a", 1),
                activityWithNumber("b", 3),
            ]);
            const element = { businessObject: {} } as unknown as Element;

            const result = registry.generateAutomaticNumber(element);

            expect(result).toBe(2);
            expect(element.businessObject.number).toBe(2);
        });

        it("returns 1 for the first activity when none exist yet", () => {
            const { registry } = makeSut([]);
            const element = { businessObject: {} } as unknown as Element;

            expect(registry.generateAutomaticNumber(element)).toBe(1);
        });
    });

    describe("updateExistingNumbersAtEditing", () => {
        it("applies the cascade to business objects and fires element.changed", () => {
            const shifted = activityWithNumber("b", 2);
            const untouched = activityWithNumber("a", 1);
            const { registry, eventBus } = makeSut();

            registry.updateExistingNumbersAtEditing(
                [untouched, shifted] as never[],
                2,
            );

            expect(shifted.businessObject.number).toBe(3);
            expect(untouched.businessObject.number).toBe(1);
            expect(eventBus.fire).toHaveBeenCalledTimes(1);
            expect(eventBus.fire).toHaveBeenCalledWith("element.changed", {
                element: shifted,
            });
        });

        it("carries the multiple-number allowance to the shifted number", () => {
            const { registry } = makeSut();
            registry.setNumberIsMultiple(2, true);

            registry.updateExistingNumbersAtEditing(
                [activityWithNumber("a", 2)] as never[],
                2,
            );

            expect(registry.isNumberMultiple(3)).toBe(true);
        });
    });

    describe("getNumbersAndIDs", () => {
        it("snapshots id and number of every actor activity", () => {
            const { registry } = makeSut([
                activityWithNumber("a", 1),
                activityWithNumber("b", 2),
            ]);

            expect(registry.getNumbersAndIDs()).toEqual([
                { id: "b", number: 2 },
                { id: "a", number: 1 },
            ]);
        });
    });

    describe("isNumberMultiple", () => {
        it("reflects the flag set via setNumberIsMultiple", () => {
            const { registry } = makeSut();

            registry.setNumberIsMultiple(5, true);
            expect(registry.isNumberMultiple(5)).toBe(true);

            registry.setNumberIsMultiple(5, false);
            expect(registry.isNumberMultiple(5)).toBe(false);
        });

        it("defaults to false for indices that were never set", () => {
            expect(makeSut().registry.isNumberMultiple(99)).toBe(false);
        });
    });
});
