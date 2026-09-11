import type { ActivityCanvasObject, CanvasObject } from "./canvasObject";
import {
    isActivity,
    isActor,
    isAnnotation,
    isGroup,
} from "./elementPredicates";

export interface ReplayStep {
    readonly activityNumber: number;
    readonly visibleElementIds: readonly string[];
    readonly highlightedElementIds: readonly string[];
}

export interface ReplayStory {
    readonly steps: readonly ReplayStep[];
    readonly groupElementIds: readonly string[];
}

export interface ReplayState {
    readonly active: boolean;
    readonly stepIndex: number | null;
    readonly stepCount: number;
    readonly activityNumber: number | null;
    readonly hasGroups: boolean;
    readonly showGroups: boolean;
}

export interface ReplayStartOptions {
    readonly showGroups?: boolean;
}

/**
 * Builds replay steps without touching diagram-js or the DOM.
 *
 * Actor-originating activities are grouped by numeric sequence number. Each
 * root traces through downstream work objects, stopping at actors and guarding
 * every visited id so malformed cycles cannot hang replay.
 */
export function createReplayStory(
    elements: readonly CanvasObject[],
    groups: readonly CanvasObject[],
): ReplayStory {
    const roots = elements
        .filter(isReplayRoot)
        .sort(
            (left, right) =>
                Number(left.businessObject.number) -
                    Number(right.businessObject.number) ||
                left.id.localeCompare(right.id),
        );
    const rootsByNumber = new Map<number, ActivityCanvasObject[]>();

    for (const root of roots) {
        const number = Number(root.businessObject.number);
        const parallel = rootsByNumber.get(number) ?? [];
        parallel.push(root);
        rootsByNumber.set(number, parallel);
    }

    const cumulative = new Set<string>();
    const steps: ReplayStep[] = [];
    for (const [activityNumber, parallelRoots] of rootsByNumber) {
        const current = new Set<string>();
        for (const root of parallelRoots) {
            traceActivity(root, current);
        }
        current.forEach((id) => cumulative.add(id));
        steps.push({
            activityNumber,
            visibleElementIds: [...cumulative],
            highlightedElementIds: [...current],
        });
    }

    const groupIds = new Set<string>();
    for (const group of groups) {
        if (!isGroup(group)) continue;
        addElementAndAnnotations(group, groupIds);
    }

    return { steps, groupElementIds: [...groupIds] };
}

function isReplayRoot(element: CanvasObject): element is ActivityCanvasObject {
    if (!isActivity(element)) return false;
    const activity = element as ActivityCanvasObject;
    const number = Number(activity.businessObject.number);
    return isActor(activity.source) && Number.isFinite(number);
}

function traceActivity(
    activity: ActivityCanvasObject,
    visited: Set<string>,
): void {
    if (!activity?.id || visited.has(activity.id)) return;

    addElementAndAnnotations(activity.source, visited);
    visited.add(activity.id);
    const target = activity.target;
    if (!target) return;
    addElementAndAnnotations(target, visited);

    if (isActor(target)) return;
    for (const outgoing of target.outgoing ?? []) {
        if (isActivity(outgoing)) {
            traceActivity(outgoing, visited);
        }
    }
}

function addElementAndAnnotations(
    element: CanvasObject | undefined,
    visited: Set<string>,
): void {
    if (!element?.id) return;
    visited.add(element.id);

    for (const connection of element.outgoing ?? []) {
        if (isActivity(connection)) continue;
        const target = connection.target;
        if (target && isAnnotation(target)) {
            visited.add(connection.id);
            visited.add(target.id);
        }
    }

    for (const attacher of Array.isArray(element.attachers)
        ? element.attachers
        : []) {
        if (attacher?.id) visited.add(attacher.id);
    }
}
