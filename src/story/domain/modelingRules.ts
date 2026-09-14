import { ElementTypes } from "./elementTypes";
import {
    isActivity,
    isActor,
    isAnnotation,
    isBackground,
    isConnection,
    isGroup,
    isWorkObject,
} from "./elementPredicates";
import {
    ALLOWED,
    DENIED,
    RuleVerdict,
    allowedAs,
    noOpinion,
} from "./ruleVerdict";

/**
 * The Domain Storytelling notation grammar: which elements may connect, be
 * resized, and be created where.
 *
 * WHY: these are the rules of the notation, not of diagram-js. Keeping them here
 * — pure, framework-free, tested exhaustively — lets `DomainStoryRules` shrink to
 * a thin diagram-js adapter and makes the grammar the same in every host. Every
 * `judge*` function answers with a {@link RuleVerdict}, including the "no
 * opinion" and "ignore" outcomes the adapter used to invent for itself; the
 * adapter's only remaining job is the wire mapping and diagram-js' in-place
 * `newBounds` mutation contract. They are named `judge*` rather than `can*`
 * because the answer is no longer yes/no.
 */

/** Minimum edge length of a group, in canvas units. */
export const GROUP_MIN_SIZE = 125;

// Two members so both strict domain objects and a diagram-js `Element` are
// assignable (see elementPredicates' TypedElement for the weak-type rationale).
type GrammarElement =
    | { type?: string; id?: string }
    | { type?: string; id?: string; [key: string]: unknown }
    | null
    | undefined;

export interface Bounds {
    x: number;
    y: number;
    width: number;
    height: number;
}

/**
 * Decides whether `source` may connect to `target` and, if so, which connection
 * type results: an annotation connection when the target is a text annotation,
 * an activity otherwise. The guard order is load-bearing: each denial keeps its
 * own reason, and the annotation guards run last so an annotation is only ever
 * an edge *target*, never a source of an activity. Never defers — a connection
 * the grammar does not describe is denied, not left to someone else.
 */
export function judgeConnection(
    source: GrammarElement,
    target: GrammarElement,
): RuleVerdict {
    // Never connect to the background; a dragged activity can reverse direction,
    // so both ends must be checked.
    if (isBackground(target) || isBackground(source)) {
        return DENIED;
    }

    if (isGroup(target)) {
        return DENIED;
    }

    // No self-connections.
    if (source === target) {
        return DENIED;
    }

    // No connection between two actors.
    if (isActor(source) && isActor(target)) {
        return DENIED;
    }

    // An activity/connection is itself an edge and cannot be an endpoint.
    if (isActivity(source) || isActivity(target)) {
        return DENIED;
    }
    if (isConnection(source) || isConnection(target)) {
        return DENIED;
    }

    // An annotation is only ever an edge *target*: its context pad cannot start
    // a connection and `elementUpdateHandler` reads its edge as `incoming[0]`,
    // so an activity out of an annotation is a shape the model cannot express.
    if (isAnnotation(source) && !isAnnotation(target)) {
        return DENIED;
    }

    // Connecting to an annotation yields an annotation connection, not an
    // activity.
    if (isAnnotation(target)) {
        return allowedAs(ElementTypes.CONNECTION);
    }

    return allowedAs(ElementTypes.ACTIVITY);
}

/**
 * The three annotation-edge shapes the grammar forbids on a reconnect: an
 * activity touching an annotation at *either* end, an annotation connection
 * joining two annotations, and an annotation connection from an actor/work
 * object that does not land on an annotation.
 *
 * WHY both ends are checked for an activity: `BendpointMove` retries a denied
 * reconnect with the endpoints swapped, so guarding only the target lets the
 * retry re-create the same illegal edge reversed. An annotation is only ever an
 * edge target here (its context pad cannot start a connection).
 */
export function isForbiddenAnnotationEdge(
    source: GrammarElement,
    target: GrammarElement,
    connection: GrammarElement,
): boolean {
    if (
        isActivity(connection) &&
        (isAnnotation(source) || isAnnotation(target))
    ) {
        return true;
    }

    if (
        isConnection(connection) &&
        isAnnotation(source) &&
        isAnnotation(target)
    ) {
        return true;
    }

    return (
        isConnection(connection) &&
        !isAnnotation(target) &&
        (isActor(source) || isWorkObject(source))
    );
}

/**
 * Judges moving an existing edge's endpoint onto `source`/`target`: the extra
 * annotation-edge prohibitions first, then the ordinary connection grammar.
 *
 * WHY it lives here and not in the adapter: composing the two used to be the
 * adapter's job, and it got the deny half wrong (#66). A reconnect is a single
 * grammatical question, so the grammar answers it in one call.
 */
export function judgeReconnect(
    source: GrammarElement,
    target: GrammarElement,
    connection: GrammarElement,
): RuleVerdict {
    if (isForbiddenAnnotationEdge(source, target, connection)) {
        return DENIED;
    }

    return judgeConnection(source, target);
}

/** Only groups are resizable. */
export function judgeResize(shape: GrammarElement): RuleVerdict {
    return isGroup(shape) ? ALLOWED : DENIED;
}

/**
 * Clamps a requested group resize so the group never shrinks below
 * {@link GROUP_MIN_SIZE}. The active corner is inferred from which of x/y moved
 * relative to `current`: dragging an upper corner would otherwise let it cross
 * the opposite edge, so those corners are pinned a minimum span away. Returns a
 * fresh object and never mutates its inputs; the adapter applies the result onto
 * diagram-js's `newBounds` to honour its in-place contract.
 */
export function clampGroupBounds(current: Bounds, requested: Bounds): Bounds {
    const result: Bounds = { ...requested };

    const lowerLeft = { x: current.x, y: current.y + current.height };
    const lowerRight = {
        x: current.x + current.width,
        y: current.y + current.height,
    };
    const upperRight = { x: current.x + current.width, y: current.y };

    // Conditions read `result` progressively (mirroring the former in-place
    // mutation) so a clamp on x can influence a later branch, exactly as before.
    if (result.x !== current.x && result.y !== current.y) {
        // upper left
        if (result.x > lowerRight.x - GROUP_MIN_SIZE) {
            result.x = lowerRight.x - GROUP_MIN_SIZE;
        }
        if (result.y > lowerRight.y - GROUP_MIN_SIZE) {
            result.y = lowerRight.y - GROUP_MIN_SIZE;
        }
    }

    if (result.x !== current.x && result.y === current.y) {
        // lower left
        if (result.x > upperRight.x - GROUP_MIN_SIZE) {
            result.x = upperRight.x - GROUP_MIN_SIZE;
        }
    }

    if (result.x === current.x && result.y !== current.y) {
        // upper right
        if (result.y > lowerLeft.y - GROUP_MIN_SIZE) {
            result.y = lowerLeft.y - GROUP_MIN_SIZE;
        }
    }

    if (result.height < GROUP_MIN_SIZE) {
        result.height = GROUP_MIN_SIZE;
    }
    if (result.width < GROUP_MIN_SIZE) {
        result.width = GROUP_MIN_SIZE;
    }

    return result;
}

/**
 * Whether `shape` may be created on (or moved onto) `target`: on the canvas
 * background, or when either the shape or the target is a group (groups may nest
 * anything and be nested anywhere).
 *
 * With no hover target at all the grammar has nothing to say — a plain shape
 * over empty canvas is neither described nor forbidden, so it defers. Denying it
 * would forbid dragging any non-group across the canvas. That deferral used to
 * live in the adapter as a hand-rolled tri-state; owning it here is why
 * `RuleVerdict` has a `noOpinion` kind.
 */
export function judgeCreation(
    shape: GrammarElement,
    target: GrammarElement,
): RuleVerdict {
    if (!target) {
        return isGroup(shape) ? ALLOWED : noOpinion("noHoverTarget");
    }

    return isBackground(target) || isGroup(shape) || isGroup(target)
        ? ALLOWED
        : DENIED;
}
