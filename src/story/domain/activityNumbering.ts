import { isActor } from "./elementPredicates";

/**
 * Activity-numbering policy of Domain Storytelling.
 *
 * WHY: which activities carry sequence numbers, which number a new activity
 * receives, and how existing numbers shift when one is edited is core notation
 * policy — not a canvas concern. It used to live in the diagram-js adapter
 * (`DomainStoryNumberingRegistry`) entangled with EventBus/CommandStack, which
 * made the arithmetic testable only through mocks. These functions are pure:
 * they read plain data and return assignments; applying them (mutating business
 * objects, firing change events) stays in the infrastructure adapter.
 */

/**
 * An activity as the numbering math sees it: an identity to address the
 * assignment to, and its current number. Structural so canvas objects, business
 * objects, and test literals all fit without importing framework types.
 */
export interface NumberedActivity {
    id: string;
    number?: number | null;
}

/** A computed re-numbering: which activity must change to which number. */
export interface NumberAssignment {
    id: string;
    newNumber: number;
}

/**
 * The smallest positive integer not yet used as an activity number — deleted
 * activities leave gaps, and the story reads best when those gaps are refilled
 * before the sequence grows.
 *
 * Falsy entries (activities without a number) are ignored. Behavior-equivalent
 * to the historical gap-search loop (seed `[0]`, scan up to the list length,
 * fall back to the length): by pigeonhole that loop always found exactly the
 * smallest unused positive integer.
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
 * Cascade renumbering when an activity is (re-)assigned `editedNumber`: every
 * occupied number ≥ `editedNumber` moves up to the next consecutive slot, so
 * the edited activity claims its number without duplicating it. Gaps above the
 * edited number are compacted as a side effect — occupied numbers are packed
 * consecutively from `editedNumber + 1` upward, preserving their order.
 *
 * Activities sharing one number move together (the multiple-number allowance),
 * and each number's "may occur multiple times" flag travels with it: the
 * returned updates re-index `multipleAllowedByNumber` from old to new slots.
 * The edited activity itself must not be in `activities` — the caller already
 * holds it and excludes it, exactly as the popup edit flow does.
 */
export function renumberOnNumberEdit(
    activities: readonly NumberedActivity[],
    editedNumber: number,
    multipleAllowedByNumber: readonly boolean[],
): {
    assignments: NumberAssignment[];
    multipleAllowedUpdates: { number: number; allowed: boolean }[];
} {
    const activitiesByNumber: NumberedActivity[][] = [];
    activities.forEach((activity) => {
        if (activity.number) {
            (activitiesByNumber[activity.number] ??= []).push(activity);
        }
    });

    const assignments: NumberAssignment[] = [];
    const multipleAllowedUpdates: { number: number; allowed: boolean }[] = [];

    let nextNumber = editedNumber;
    for (
        let currentNumber = editedNumber;
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
 * Which snapshot numbers to restore on undo: match snapshot entries to the
 * currently live activities by exact id and hand back each live activity its
 * recorded number (possibly `undefined`, meaning "had none").
 *
 * Matches by strict equality and consumes each snapshot entry at most once —
 * the historical implementation matched with substring `includes` and spliced
 * a hard-coded negative index, so undo could restore the wrong bookkeeping
 * entry whenever one id prefixed another (e.g. `activity_1` / `activity_12`).
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
 * The activities that participate in numbering, in story order: only an
 * activity whose source is an actor gets a sequence number (work-object →
 * actor arrows are responses, not story steps), sorted ascending by number.
 * This is the rule the renderer and the element registry both rely on.
 *
 * Generic over the activity shape so `ActivityCanvasObject` (or any structural
 * equivalent) passes through unchanged; the input array is not mutated.
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
