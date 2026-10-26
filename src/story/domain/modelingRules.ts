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
 * resized, and be created where. Each `judge*` returns a {@link RuleVerdict},
 * not a boolean, so "no opinion" stays a grammar decision.
 */

/** Minimum edge length of a group, in canvas units. */
export const GROUP_MIN_SIZE = 125;

// Two members so both strict domain objects and a diagram-js `Element` are
// assignable (see elementPredicates' TypedElement).
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
 * Connecting to a text annotation yields an annotation connection, anything
 * else an activity. Never defers: a connection the grammar does not describe is
 * denied.
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

    if (source === target) {
        return DENIED;
    }

    if (isActor(source) && isActor(target)) {
        return DENIED;
    }

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

    if (isAnnotation(target)) {
        return allowedAs(ElementTypes.CONNECTION);
    }

    return allowedAs(ElementTypes.ACTIVITY);
}

/**
 * Both ends are checked for an activity because `BendpointMove` retries a
 * denied reconnect with the endpoints swapped, which would re-create the edge
 * reversed.
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

/** A reconnect is one grammatical question, so it is answered in one call. */
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

export function judgeResize(shape: GrammarElement): RuleVerdict {
    return isGroup(shape) ? ALLOWED : DENIED;
}

/**
 * Keeps a group at least {@link GROUP_MIN_SIZE}. The active corner is inferred
 * from which of x/y moved; upper corners are pinned so they cannot cross the
 * opposite edge. Returns a fresh object; the adapter writes it onto diagram-js'
 * `newBounds` to honour its in-place contract.
 */
export function clampGroupBounds(current: Bounds, requested: Bounds): Bounds {
    const result: Bounds = { ...requested };

    const lowerLeft = { x: current.x, y: current.y + current.height };
    const lowerRight = {
        x: current.x + current.width,
        y: current.y + current.height,
    };
    const upperRight = { x: current.x + current.width, y: current.y };

    // Later branches read the already-clamped `result`, so a clamp on x can
    // change which corner branch applies next.
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
 * Allowed on the background, or when the shape or target is a group (groups
 * nest anything). With no hover target it defers: denying would forbid dragging
 * any non-group across the canvas.
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
