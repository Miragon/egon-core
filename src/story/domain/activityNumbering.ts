import { isActor } from "./elementPredicates";

/**
 * Activity-numbering policy: pure decisions that the infrastructure adapter
 * applies.
 */

/** Structural so canvas objects, business objects and test literals all fit. */
export interface NumberedActivity {
    id: string;
    number?: number | null;
}

export interface NumberAssignment {
    id: string;
    newNumber: number;
}

/**
 * Carries the id so the cascade can exclude the edited activity. `number` is
 * assumed positive; only the caller can tell a cleared input field from a
 * number.
 */
export interface ActivityNumberEdit {
    id: string;
    number: number;
    multipleAllowed: boolean;
}

export type DirectionChangeNumberingDecision = "clear" | "generate";

/**
 * Reads the current source: an actor-sourced activity becomes a response after
 * reversal and loses its number; any other becomes a story step and gets one.
 */
export function numberingOnDirectionChange(
    currentSource: { type?: string; [key: string]: unknown } | null | undefined,
): DirectionChangeNumberingDecision {
    return isActor(currentSource) ? "clear" : "generate";
}

/**
 * The smallest unused positive number, so gaps left by deleted activities are
 * refilled before the sequence grows. Falsy entries are ignored.
 */
export function nextAvailableActivityNumber(
    usedNumbers: readonly (number | null | undefined)[],
): number {
    const used = new Set<number>();
    usedNumbers.forEach((number) => {
        if (number) {
            used.add(Number(number));
        }
    });

    let candidate = 1;
    while (used.has(candidate)) {
        candidate++;
    }
    return candidate;
}

/**
 * Moves every occupied number ≥ `edit.number` up to the next consecutive slot
 * (compacting gaps above it), so the edited activity claims its number alone.
 * - `activities` may contain the edited activity; it is excluded by id.
 * - No assignment is returned for the edited activity: it may be work-object
 *   sourced and absent from `activities`, so the caller writes its number.
 * - `edit.multipleAllowed` skips the cascade, since sharing is the point.
 * - `multipleAllowedByNumber` is read pre-edit, so each flag moves up with the
 *   activities that held the number before.
 */
export function renumberOnNumberEdit(
    activities: readonly NumberedActivity[],
    edit: ActivityNumberEdit,
    multipleAllowedByNumber: readonly boolean[],
): {
    assignments: NumberAssignment[];
    multipleAllowedUpdates: { number: number; allowed: boolean }[];
} {
    const assignments: NumberAssignment[] = [];
    const multipleAllowedUpdates: { number: number; allowed: boolean }[] = [
        { number: edit.number, allowed: edit.multipleAllowed },
    ];

    if (edit.multipleAllowed) {
        return { assignments, multipleAllowedUpdates };
    }

    const activitiesByNumber: NumberedActivity[][] = [];
    activities.forEach((activity) => {
        if (activity.number && activity.id !== edit.id) {
            (activitiesByNumber[activity.number] ??= []).push(activity);
        }
    });

    let nextNumber = edit.number;
    for (
        let currentNumber = edit.number;
        currentNumber < activitiesByNumber.length;
        currentNumber++
    ) {
        const group = activitiesByNumber[currentNumber];
        if (!group) {
            continue;
        }
        nextNumber++;
        multipleAllowedUpdates.push({
            number: nextNumber,
            allowed: multipleAllowedByNumber[currentNumber] ?? false,
        });
        group.forEach((activity) =>
            assignments.push({ id: activity.id, newNumber: nextNumber }),
        );
    }

    return { assignments, multipleAllowedUpdates };
}

/**
 * Matches snapshot entries by exact id and consumes each once, so `activity_1`
 * never picks up `activity_12`'s entry. An `undefined` number means "had none".
 */
export function restoredNumberAssignments(
    snapshot: readonly { id: string; number?: number }[],
    activityIds: readonly string[],
): { id: string; number: number | undefined }[] {
    const remaining = new Map(
        snapshot.map((entry) => [entry.id, entry.number]),
    );

    const assignments: { id: string; number: number | undefined }[] = [];
    activityIds.forEach((id) => {
        if (remaining.has(id)) {
            assignments.push({ id, number: remaining.get(id) });
            remaining.delete(id);
        }
    });
    return assignments;
}

/**
 * Only actor-sourced activities are story steps (work-object → actor arrows are
 * responses), sorted by number. The input array is not mutated.
 */
export function activitiesFromActors<
    T extends {
        source?: { type?: string } | null;
        businessObject: { number?: number | null };
    },
>(activities: readonly T[]): T[] {
    return activities
        .filter((activity) => isActor(activity.source))
        .sort(
            (activityA, activityB) =>
                Number(activityA.businessObject.number) -
                Number(activityB.businessObject.number),
        );
}
