import { BusinessObject } from "./businessObject";
import { ActivityBusinessObject } from "./activityBusinessObject";
import { ElementTypes } from "./elementTypes";
import {
    isActivity,
    isActor,
    isAnnotation,
    isConnection,
    isWorkObject,
} from "./elementPredicates";
import { nextAvailableActivityNumber } from "./activityNumbering";

/**
 * Repairs that make historical EGN files renderable. Egon.io has written
 * several element shapes over the years (no icon suffix, spaced icon names,
 * bpmn-js moddle leftovers, dangling edges); each must be normalized before
 * diagram-js sees it, or the icon lookup misses and connections lose their
 * endpoints.
 */

/**
 * The dropped edges are returned so a host can tell the user something was
 * lost.
 */
export interface PrunedStory {
    /** A new array; the input is untouched. */
    readonly elements: BusinessObject[];
    /** In document order. */
    readonly removedConnections: readonly ActivityBusinessObject[];
}

/** Only activities and annotation connections carry `source`/`target`. */
function isEdge(element: BusinessObject): boolean {
    return isActivity(element) || isConnection(element);
}

/**
 * Drops every edge whose `source` or `target` is not a shape in the same story;
 * an edge pointing at another edge dangles too. Builds a new array instead of
 * splicing in place, so no dangling edge can be skipped mid-iteration.
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
 * Maps pre-v0.5.0 work-object types onto today's names (`workObject` meant
 * Document; Bubble became Conversation), or the shape renders blank.
 *
 * Mutates in place on purpose: business object identity must survive into
 * `shape.businessObject` and back out on export.
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
 * Older files reference hyphenated icons with spaces. Icon names are verbatim
 * data (ADR ICO-1), so an exact match wins; the hyphenated form is used only
 * when it names a real icon.
 * Mutates in place, see {@link renameLegacyWorkObjectTypes}.
 */
export function normalizeIconNameWhitespace(
    elements: BusinessObject[],
    availableIconNames: ReadonlySet<string>,
): BusinessObject[] {
    for (const element of elements) {
        if (!isActor(element) && !isWorkObject(element)) {
            continue;
        }

        const typePrefix = isActor(element)
            ? ElementTypes.ACTOR
            : ElementTypes.WORKOBJECT;
        const iconName = element.type.slice(typePrefix.length);

        if (availableIconNames.has(iconName)) {
            continue;
        }

        const legacyName = iconName.replace(/ /g, "-");
        if (availableIconNames.has(legacyName)) {
            element.type = typePrefix + legacyName;
        }
    }
    return elements;
}

/**
 * Older versions stored an annotation's box height in `number`. Annotations are
 * never numbered, so `number` is always deleted or it would round-trip back
 * out; `height` wins when both exist.
 * Mutates in place, see {@link renameLegacyWorkObjectTypes}.
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
 * Gives every actor-sourced activity without a number the lowest free one.
 * Older or hand-edited files may lack numbers, and import runs no command that
 * would mint them. Existing numbers are reserved first, so only gaps are
 * filled. Mutates in place, see {@link renameLegacyWorkObjectTypes}.
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
 * `delete`, not `= undefined`: import spreads the business object into the
 * diagram-js attrs, where `$type: undefined` would shadow diagram-js' own
 * bookkeeping. Mutates in place, see {@link renameLegacyWorkObjectTypes}.
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
 * Compares `major.minor` as a number, as upstream does. The parser's no-version
 * default `"?"` yields `0`, so undated (ancient) files are repaired; a
 * `"v"`-prefixed version yields `NaN`, so repair is skipped.
 */
export function needsPreV050Repair(version: string): boolean {
    const majorMinor = +version.substring(0, version.lastIndexOf("."));
    return majorMinor <= 0.5;
}
