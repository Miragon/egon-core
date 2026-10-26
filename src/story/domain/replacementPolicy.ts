import { ElementTypes } from "./elementTypes";

export type ReplaceableElementFamily =
    ElementTypes.ACTOR | ElementTypes.WORKOBJECT;

/**
 * Excludes only the exactly composed type, case-sensitively and without
 * assuming it is registered, so overlapping icon names stay independent
 * candidates.
 */
export function isReplacementEligible(
    currentType: string | undefined,
    family: ReplaceableElementFamily,
    candidateIconName: string,
): boolean {
    return currentType !== `${family}${candidateIconName}`;
}
