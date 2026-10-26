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

export type SemanticLabelField = "name" | "text";

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
 * Takes the canvas element separately because diagram-js backgrounds are
 * identified by id and have no semantic type.
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

export function canAutocompleteLabel(
    semanticObject: TypedSemanticObject,
): boolean {
    return isWorkObject(semanticObject);
}
