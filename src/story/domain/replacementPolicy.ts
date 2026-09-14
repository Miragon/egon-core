import { ElementTypes } from "./elementTypes";

/** The two notation families whose icon suffix can be replaced. */
export type ReplaceableElementFamily =
    ElementTypes.ACTOR | ElementTypes.WORKOBJECT;

/**
 * Whether a catalogue icon represents a real replacement for the current
 * element type.
 *
 * Only the exactly composed type is excluded. The comparison is intentionally
 * case-sensitive and makes no assumption that the current type is registered;
 * overlapping icon names therefore remain independent candidates.
 */
export function isReplacementEligible(
    currentType: string | undefined,
    family: ReplaceableElementFamily,
    candidateIconName: string,
): boolean {
    return currentType !== `${family}${candidateIconName}`;
}
