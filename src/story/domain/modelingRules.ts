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

/**
 * The Domain Storytelling notation grammar: which elements may connect, be
 * resized, and be created where.
 *
 * WHY: these are the rules of the notation, not of diagram-js. Keeping them here
 * — pure, framework-free, tested exhaustively — lets `DomainStoryRules` shrink to
 * a thin diagram-js adapter and makes the grammar the same in every host. All
 * functions take structural parameters and return strict values; the adapter is
 * responsible for translating those into diagram-js's rule protocol (notably its
 * `undefined` "continue evaluating" tri-state and the in-place `newBounds`
 * mutation contract), which are framework concerns, not grammar.
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
 * an activity otherwise. The guard order is load-bearing and matches the
 * historical rule exactly. `false` denies the connection.
 */
export function canConnect(
    source: GrammarElement,
    target: GrammarElement,
): false | { type: ElementTypes } {
    // Never connect to the background; a dragged activity can reverse direction,
    // so both ends must be checked.
    if (isBackground(target) || isBackground(source)) {
        return false;
    }

    if (isGroup(target)) {
        return false;
    }

    // No self-connections.
    if (source === target) {
        return false;
    }

    // No connection between two actors.
    if (isActor(source) && isActor(target)) {
        return false;
    }

    // An activity/connection is itself an edge and cannot be an endpoint.
    if (isActivity(source) || isActivity(target)) {
        return false;
    }
    if (isConnection(source) || isConnection(target)) {
        return false;
    }

    // Connecting to an annotation yields an annotation connection, not an
    // activity.
    if (isAnnotation(target)) {
        return { type: ElementTypes.CONNECTION };
    }

    return { type: ElementTypes.ACTIVITY };
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

/** Only groups are resizable. */
export function canResize(shape: GrammarElement): boolean {
    return isGroup(shape);
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
 * Whether `shape` may be created on `target`: on the canvas background, or when
 * either the shape or the target is a group (groups may nest anything and be
 * nested anywhere). Strict boolean — the adapter adds the legacy "no target"
 * tri-state that diagram-js's move rule relies on.
 */
export function canCreate(
    shape: GrammarElement,
    target: GrammarElement,
): boolean {
    return isBackground(target) || isGroup(shape) || isGroup(target);
}

/**
 * A connection may only start from a real, non-label element. `null` signals
 * "ignore" (a missing element or a label — a label's own connection is handled
 * elsewhere); `false` denies it. Never returns `true`: starting is otherwise
 * decided by lower-priority rules.
 */
export function canStartConnection(
    element:
        | { label?: { labelTarget?: unknown }; [key: string]: unknown }
        | null
        | undefined,
): null | false {
    if (!element || !!element.label?.labelTarget) {
        return null;
    }
    return false;
}
