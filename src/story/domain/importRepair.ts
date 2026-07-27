import { BusinessObject } from "./businessObject";
import { ActivityBusinessObject } from "./activityBusinessObject";
import { ElementTypes } from "./elementTypes";
import {
    isActivity,
    isActor,
    isAnnotation,
    isConnection,
} from "./elementPredicates";
import { nextAvailableActivityNumber } from "./activityNumbering";

/**
 * Repair rules that make a historical EGN file renderable.
 *
 * WHY: Egon.io has written five materially different element shapes over the
 * years — work objects without an icon suffix, icon names with spaces, BPMN
 * leftovers (`$type`/`$descriptor`/`di`) from the days the model was a bpmn-js
 * moddle, and stories whose edges point at elements that no longer exist. Every
 * one of those has to be normalized *before* diagram-js sees it, or the icon
 * lookup misses and the canvas gets a connection with undefined endpoints.
 *
 * Since #74 the file is also where two things the *renderer* used to do on every
 * paint now happen exactly once: translating a legacy annotation height out of
 * `number`, and completing an actor's activity sequence. Both are notation
 * repairs, not drawing.
 *
 * These rules are notation knowledge, not canvas knowledge: they read plain
 * business objects and say nothing about rendering. Extracting them here (the
 * `elementPredicates`/`modelingRules` and `activityNumbering` precedent) makes
 * the branch matrix — especially the multi-dangling-edge case that the previous
 * in-place `splice` loop got wrong — directly testable without a diagram.
 */

/**
 * The result of pruning: the story that may be handed to the canvas, plus the
 * edges that had to be dropped so a host can tell the user something was lost.
 */
export interface PrunedStory {
    /** A new array with every dangling edge removed; the input is untouched. */
    readonly elements: BusinessObject[];
    /** The dropped edges, in document order. Empty when nothing was repaired. */
    readonly removedConnections: readonly ActivityBusinessObject[];
}

/**
 * Activities and annotation connections are the only elements carrying
 * `source`/`target`, so they are the only ones that can dangle. Matching by
 * type prefix (not `===`) is deliberate: the local predicates classify by
 * prefix throughout, and only the prefix is stable across format versions.
 */
function isEdge(element: BusinessObject): boolean {
    return isActivity(element) || isConnection(element);
}

/**
 * Drops every edge whose `source` or `target` does not resolve to a shape in
 * the same story.
 *
 * WHY it returns a new array instead of mutating: the historical implementation
 * did `elements = elements.splice(index, 1)`, which rebinds the local to the
 * *removed* item and silently lets every dangling edge after the first survive
 * into `canvas.addConnection` with undefined endpoints. Building a fresh array
 * makes that whole bug class structurally impossible rather than merely fixed,
 * and the dropped edges become a value the caller can report instead of a
 * discarded boolean.
 *
 * Only non-edge elements count as valid endpoints — an edge pointing at another
 * edge is as dangling as one pointing at nothing.
 */
export function pruneUnreferencedConnections(
    elements: readonly BusinessObject[],
): PrunedStory {
    const shapeIds = new Set(
        elements
            .filter((element) => !isEdge(element))
            .map((element) => element.id),
    );

    const keptElements: BusinessObject[] = [];
    const removedConnections: ActivityBusinessObject[] = [];

    for (const element of elements) {
        if (!isEdge(element)) {
            keptElements.push(element);
            continue;
        }
        const edge = element as ActivityBusinessObject;
        if (shapeIds.has(edge.source) && shapeIds.has(edge.target)) {
            keptElements.push(edge);
        } else {
            removedConnections.push(edge);
        }
    }

    return { elements: keptElements, removedConnections };
}

/**
 * Maps pre-v0.5.0 work-object types onto today's names: `workObject` was the
 * unnamed default that meant Document, and Bubble was renamed to Conversation.
 * Without this the icon dictionary has no entry for the type and the shape
 * renders blank.
 *
 * Mutates in place and returns the same array so the caller reads as a
 * pipeline. In-place is required, not incidental: the business object identity
 * must survive into `shape.businessObject` and back out on export, and cloning
 * would break the shared `waypoints` reference that keeps export byte-faithful.
 */
export function renameLegacyWorkObjectTypes(
    elements: BusinessObject[],
): BusinessObject[] {
    for (const element of elements) {
        if (element.type === ElementTypes.WORKOBJECT) {
            element.type = ElementTypes.WORKOBJECT + "Document";
        } else if (element.type === ElementTypes.WORKOBJECT + "Bubble") {
            element.type = ElementTypes.WORKOBJECT + "Conversation";
        }
    }
    return elements;
}

/**
 * Replaces spaces in the icon-name suffix with hyphens. Early Egon.io allowed
 * whitespace in icon names; the dictionary is keyed without it, so an
 * un-normalized type finds no icon. Mutates in place — see
 * {@link renameLegacyWorkObjectTypes}.
 */
export function normalizeIconNameWhitespace(
    elements: BusinessObject[],
): BusinessObject[] {
    for (const element of elements) {
        if (element.type) {
            element.type = element.type.replace(/ /g, "-");
        }
    }
    return elements;
}

/**
 * Moves a legacy annotation height out of `number` and into `height`, then drops
 * `number` entirely.
 *
 * WHY this is the only place that may know the old hack existed: until #74,
 * `DomainStoryRenderer.drawAnnotation` stashed an annotation's box height in
 * `businessObject.number` — commented as "the keyword height is not exported",
 * which stopped being true once the export pass started writing `height` itself.
 * Drawing is a read now, so nothing on a live canvas writes `number` for an
 * annotation any more; a file that carries one was written by an older version
 * and needs it translated on the way in.
 *
 * `number` is deleted unconditionally, not only when it was used: annotations
 * take no part in activity numbering, so any `number` on one is a leftover, and
 * leaving it in place would round-trip the retired field straight back out.
 * `height` wins when both are present — it is the field the export pass owns.
 *
 * Mutates in place — see {@link renameLegacyWorkObjectTypes}.
 */
export function useLegacyAnnotationNumberAsHeight(
    elements: BusinessObject[],
): BusinessObject[] {
    for (const element of elements) {
        if (!isAnnotation(element)) {
            continue;
        }
        const legacy = element as unknown as Record<string, unknown>;
        const legacyHeight = legacy["number"];

        if (!element.height && typeof legacyHeight === "number") {
            element.height = legacyHeight;
        }
        delete legacy["number"];
    }
    return elements;
}

/**
 * Gives every actor-sourced activity that has no number the lowest free one.
 *
 * WHY it exists at all: until #74 a *repaint* minted missing numbers, so opening
 * a hand-made or hand-edited file silently completed its sequence. Numbering now
 * belongs to `connection.create`/`connection.reconnect`, and import runs no
 * command — so without this repair such a file would render numberless
 * activities. Keeping the behaviour at import time rather than in the draw pass
 * is the whole point: it happens once, before the canvas sees the story, instead
 * of on every paint.
 *
 * Only an activity whose *source is an actor* is a story step (the rule
 * `activitiesFromActors` encodes); a response arrow keeps whatever it had. The
 * numbers already in the file are reserved first, so an existing sequence is
 * never renumbered — the repair only fills gaps.
 *
 * Mutates in place — see {@link renameLegacyWorkObjectTypes}.
 */
export function numberActivitiesFromActors(
    elements: BusinessObject[],
): BusinessObject[] {
    const typeById = new Map(elements.map((element) => [element.id, element]));

    const stepsWithoutNumber: ActivityBusinessObject[] = [];
    const usedNumbers: (number | undefined)[] = [];

    for (const element of elements) {
        if (!isActivity(element)) {
            continue;
        }
        const activity = element as ActivityBusinessObject;
        if (!isActor(typeById.get(activity.source))) {
            continue;
        }
        if (activity.number == null) {
            stepsWithoutNumber.push(activity);
        } else {
            usedNumbers.push(activity.number);
        }
    }

    for (const activity of stepsWithoutNumber) {
        activity.number = nextAvailableActivityNumber(usedNumbers);
        usedNumbers.push(activity.number);
    }

    return elements;
}

/** BPMN moddle leftovers that v1.3.0–4.0.0 files still carry. */
const BPMN_PROPERTIES = ["$type", "$descriptor", "di"] as const;

/**
 * Removes the bpmn-js moddle leftovers from every business object.
 *
 * `delete` rather than assigning `undefined`: the import service spreads the
 * business object into the diagram-js attrs (`assign({businessObject}, bo)`),
 * so a retained `$type: undefined` would leak onto the element and shadow
 * diagram-js' own bookkeeping. Mutates in place — see
 * {@link renameLegacyWorkObjectTypes}.
 */
export function stripBpmnProperties(
    elements: BusinessObject[],
): BusinessObject[] {
    for (const element of elements) {
        for (const property of BPMN_PROPERTIES) {
            delete (element as unknown as Record<string, unknown>)[property];
        }
    }
    return elements;
}

/**
 * Whether a file's declared version predates v0.5.0 and therefore needs
 * {@link renameLegacyWorkObjectTypes}.
 *
 * The `major.minor` prefix is compared as a *number*, which is how upstream has
 * always gated this and pins two non-obvious cases:
 * - `"?"` — the parser's default when the file declares no version — has no
 *   `"."`, so `substring(0, -1)` is `""` and `+""` is `0`: repair runs, which is
 *   what an undated (therefore ancient) file needs.
 * - a `"v"`-prefixed version yields `NaN`, and every `NaN` comparison is false,
 *   so repair is skipped.
 */
export function needsPreV050Repair(version: string): boolean {
    const majorMinor = +version.substring(0, version.lastIndexOf("."));
    return majorMinor <= 0.5;
}
