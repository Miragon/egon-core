import {
    isActivity,
    isActor,
    isAnnotation,
    isBackground,
    isGroup,
    isWorkObject,
} from "./elementPredicates";

type TypedSemanticObject =
    { type?: string; [key: string]: unknown } | null | undefined;

type CanvasIdentity =
    { id?: string; [key: string]: unknown } | null | undefined;

/** The semantic fields used as labels by supported notation elements. */
export type SemanticLabelField = "name" | "text";

/** Select the semantic field that carries a notation element's label. */
export function semanticLabelField(
    semanticObject: TypedSemanticObject,
): SemanticLabelField | undefined {
    if (
        isActor(semanticObject) ||
        isWorkObject(semanticObject) ||
        isActivity(semanticObject) ||
        isGroup(semanticObject)
    ) {
        return "name";
    }
    if (isAnnotation(semanticObject)) {
        return "text";
    }
    return undefined;
}

/**
 * Whether direct label editing may be activated for a canvas element and its
 * resolved semantic object. Canvas identity is intentionally separate from
 * semantic classification: diagram-js backgrounds are identified by id and
 * have no Domain Storytelling semantic type.
 */
export function canEditLabel(
    canvasElement: CanvasIdentity,
    semanticObject: TypedSemanticObject,
): boolean {
    return (
        !isBackground(canvasElement) &&
        semanticLabelField(semanticObject) !== undefined
    );
}

/** Work-object labels are the only labels that receive autocomplete. */
export function canAutocompleteLabel(
    semanticObject: TypedSemanticObject,
): boolean {
    return isWorkObject(semanticObject);
}
