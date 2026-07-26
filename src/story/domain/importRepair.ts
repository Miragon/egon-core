import { BusinessObject } from "./businessObject";
import { ActivityBusinessObject } from "./activityBusinessObject";
import { ElementTypes } from "./elementTypes";
import { isActivity, isConnection } from "./elementPredicates";

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
