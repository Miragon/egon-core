import { ElementTypes } from "./elementTypes";

/**
 * Structural classification predicates for Domain Storytelling elements.
 *
 * WHY: which family an element belongs to (actor, work object, activity, …) is
 * domain knowledge that the notation grammar and ~15 call sites all need. It
 * used to be re-derived ad hoc via `.includes(...)`, `=== ElementTypes.X`, and
 * raw regex; centralizing it here makes `elementTypes.ts` the single source of
 * type checks and keeps the rules pure (no diagram-js, no DOM).
 *
 * The predicates match on the type prefix because actor/work-object types carry
 * the icon name as a suffix (e.g. `domainStory:actorPerson`). `startsWith` is
 * the exact equivalent of the former anchored regexes (their trailing `\w*` was
 * vacuous) and is strictly safer than `.includes`, which could match the prefix
 * mid-string. All take structural parameters so a diagram-js `Element` — whose
 * `Record<string, any>` index signature satisfies them — can be passed without a
 * cast, accept `null`/`undefined`, and return a strict `boolean`.
 */

/** The namespace every Domain Storytelling type shares; no enum member owns it. */
const DOMAIN_STORY_PREFIX = "domainStory:";

/** diagram-js labels the canvas root with this implicit id (IMPLICIT_ROOT_ID). */
const IMPLICIT_ROOT_PREFIX = "__implicitroot";

/**
 * The structural shape these predicates read. Two members by design: the plain
 * `{ type?; id? }` accepts strict domain objects (`CanvasObject`, business
 * objects, test literals), while the index-signatured member accepts a diagram-js
 * `Element` — whose own `Record<string, any>` index signature would otherwise
 * trip TypeScript's weak-type check against an all-optional type. Together they
 * take everything the call sites pass without a cast.
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
 * The canvas background is the diagram-js implicit root, identified by its id
 * rather than a `domainStory:*` type — nothing may connect to or be created
 * "on" it except via the group/background allowances in the grammar.
 */
export function isBackground(element: TypedElement): boolean {
    return element?.id?.startsWith(IMPLICIT_ROOT_PREFIX) ?? false;
}
