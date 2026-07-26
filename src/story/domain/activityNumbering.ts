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
 * The edit the cascade has to make room for: which activity claims which
 * number, and whether that number may be shared. Passed as one descriptor so
 * the identity travels with the number — the cascade needs the id to exclude
 * the edited activity from its own renumbering.
 *
 * `number` is assumed positive; the falsy guard lives at the call site, which
 * can still tell a cleared input field apart from a real number.
 */
export interface ActivityNumberEdit {
    id: string;
    number: number;
    multipleAllowed: boolean;
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
 * Cascade renumbering when an activity is (re-)assigned `edit.number`: every
 * occupied number ≥ `edit.number` moves up to the next consecutive slot, so the
 * edited activity claims its number without duplicating it. Gaps above the
 * edited number are compacted as a side effect — occupied numbers are packed
 * consecutively from `edit.number + 1` upward, preserving their order.
 *
 * Four things a future reader would otherwise undo:
 *
 * 1. `activities` **may** contain the edited activity; it is excluded here by
 *    `edit.id`. The predecessor asked the caller to exclude it, and the caller
 *    did so with `splice(indexOf(...), 1)` — which removes the *last* entry on
 *    a miss. Filtering by id cannot miss.
 * 2. No assignment is returned for the edited activity. It may be sourced from
 *    a work object and so absent from `activities` altogether; the caller owns
 *    writing its number either way.
 * 3. `edit.multipleAllowed` suppresses the cascade entirely — sharing a number
 *    is the whole point of the allowance, so nothing must move out of the way.
 * 4. `multipleAllowedByNumber` is read **pre-edit**: slot `edit.number` still
 *    holds the *previous* occupant's flag, and that flag travels upward with
 *    them. The edit's own allowance is emitted separately (always first, and
 *    every cascade slot is `> edit.number`, so the two cannot collide).
 *
 * Activities sharing one number move together, and each number's "may occur
 * multiple times" flag travels with it: the returned updates re-index
 * `multipleAllowedByNumber` from old to new slots.
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
