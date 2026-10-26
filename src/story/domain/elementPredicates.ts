import { ElementTypes } from "./elementTypes";

/**
 * Element-family predicates. They match the type prefix because actor and
 * work-object types carry the icon name as a suffix
 * (`domainStory:actorPerson`).
 */

/** The namespace every Domain Storytelling type shares; no enum member owns it. */
const DOMAIN_STORY_PREFIX = "domainStory:";

/** diagram-js labels the canvas root with this implicit id (IMPLICIT_ROOT_ID). */
const IMPLICIT_ROOT_PREFIX = "__implicitroot";

/**
 * Two members: the index-signatured one accepts a diagram-js `Element`, whose
 * `Record<string, any>` would otherwise trip TypeScript's weak-type check.
 */
type TypedElement =
    | { type?: string; id?: string }
    | { type?: string; id?: string; [key: string]: unknown }
    | null
    | undefined;

export function isDomainStoryElement(element: TypedElement): boolean {
    return element?.type?.startsWith(DOMAIN_STORY_PREFIX) ?? false;
}

export function isActor(element: TypedElement): boolean {
    return element?.type?.startsWith(ElementTypes.ACTOR) ?? false;
}

export function isWorkObject(element: TypedElement): boolean {
    return element?.type?.startsWith(ElementTypes.WORKOBJECT) ?? false;
}

export function isActivity(element: TypedElement): boolean {
    return element?.type?.startsWith(ElementTypes.ACTIVITY) ?? false;
}

export function isConnection(element: TypedElement): boolean {
    return element?.type?.startsWith(ElementTypes.CONNECTION) ?? false;
}

export function isAnnotation(element: TypedElement): boolean {
    return element?.type?.startsWith(ElementTypes.TEXTANNOTATION) ?? false;
}

export function isGroup(element: TypedElement): boolean {
    return element?.type?.startsWith(ElementTypes.GROUP) ?? false;
}

/**
 * The background is diagram-js' implicit root, identified by id, not by type.
 */
export function isBackground(element: TypedElement): boolean {
    return element?.id?.startsWith(IMPLICIT_ROOT_PREFIX) ?? false;
}
