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
        /** The edit descriptor, with an id no fixture below reuses. */
        const edit = (number: number, multipleAllowed = false) => ({
            id: "edited",
            number,
            multipleAllowed,
        });

        it("applies the cascade to business objects and fires element.changed", () => {
            const shifted = activityWithNumber("b", 2);
            const untouched = activityWithNumber("a", 1);
            const { registry, eventBus } = makeSut();

            registry.updateExistingNumbersAtEditing(
                [untouched, shifted] as never[],
                edit(2),
            );

            expect(shifted.businessObject.number).toBe(3);
            expect(untouched.businessObject.number).toBe(1);
            expect(eventBus.fire).toHaveBeenCalledTimes(1);
            expect(eventBus.fire).toHaveBeenCalledWith("element.changed", {
                element: shifted,
            });
        });

        it("carries the *previous* occupant's allowance to the shifted number", () => {
            const { registry } = makeSut();
            registry.setNumberIsMultiple(2, true);

            // The edit itself does not allow sharing, so slot 2 loses the flag
            // and the activity moving to 3 takes it along. The flags are read
            // pre-edit, which is what makes this carry possible.
            registry.updateExistingNumbersAtEditing(
                [activityWithNumber("a", 2)] as never[],
                edit(2, false),
            );

            expect(registry.isNumberMultiple(3)).toBe(true);
            expect(registry.isNumberMultiple(2)).toBe(false);
        });

        // T2.1
        it("applies the edited number's own allowance and suppresses the cascade", () => {
            const sharing = activityWithNumber("a", 2);
            const { registry, eventBus } = makeSut();

            registry.updateExistingNumbersAtEditing(
                [sharing] as never[],
                edit(2, true),
            );

            expect(registry.isNumberMultiple(2)).toBe(true);
            expect(sharing.businessObject.number).toBe(2);
            expect(eventBus.fire).not.toHaveBeenCalled();
        });

        // T2.2
        it("excludes the edited activity from its own cascade", () => {
            const edited = activityWithNumber("edited", 3);
            const other = activityWithNumber("a", 1);
            const { registry } = makeSut();

            registry.updateExistingNumbersAtEditing(
                [other, edited] as never[],
                edit(1),
            );

            expect(other.businessObject.number).toBe(2);
            // The handler writes the edited activity's number; the cascade must
            // not shift it away from the number it is claiming.
            expect(edited.businessObject.number).toBe(3);
        });
    });

    describe("snapshot/restore of the multiple-number registry", () => {
        // T2.3 — the aliasing lock. The command context holds one snapshot for
        // the lifetime of the action, across undo → redo → undo. If restore
        // installed it by reference, the redo's cascade would write through it
        // and the second undo would restore post-edit values, silently.
        it("keeps a snapshot immune to writes made after restoring it", () => {
            const { registry } = makeSut();
            registry.setNumberIsMultiple(1, true);

            const snapshot = registry.snapshotMultipleNumberRegistry();

            registry.setNumberIsMultiple(1, false);
            registry.restoreMultipleNumberRegistry(snapshot);
            expect(registry.isNumberMultiple(1)).toBe(true);

            registry.setNumberIsMultiple(1, false);
            registry.restoreMultipleNumberRegistry(snapshot);
            expect(registry.isNumberMultiple(1)).toBe(true);
        });

        // T2.4 — merge-vs-replace: a per-index write-back would leave the slots
        // the cascade appended beyond the snapshot's length in place.
        it("drops flags added beyond the snapshot's length", () => {
            const { registry } = makeSut();
            const snapshot = registry.snapshotMultipleNumberRegistry();

            registry.setNumberIsMultiple(7, true);
            registry.restoreMultipleNumberRegistry(snapshot);

            expect(registry.isNumberMultiple(7)).toBe(false);
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
