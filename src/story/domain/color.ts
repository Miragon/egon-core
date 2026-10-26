/**
 * `pickedColor` is the user's choice and nullable: absent means the renderer
 * decides. Whether a stored value expresses that default is notation knowledge.
 */

import { ElementTypes } from "./elementTypes";

export const DEFAULT_COLOR = "#000000";

/**
 * Every literal Egon.io has written for the default. Older versions stamped
 * `"black"` onto activities, so a plain `!== DEFAULT_COLOR` would read those
 * files as a custom colour.
 */
const DEFAULT_COLOR_LITERALS: readonly string[] = ["black", "#000", "#000000"];

/**
 * Falsy counts as default: an empty string is not a colour anyone chose.
 * Case-insensitive because the shorthand forms were hand-written in places.
 */
export function isDefaultColor(color?: string | null): boolean {
    if (!color) {
        return true;
    }
    return DEFAULT_COLOR_LITERALS.includes(color.trim().toLowerCase());
}

/** Annotation recoloring includes its incoming dashed connector. */
export function colorIncludesIncomingConnection(type: string): boolean {
    return type === ElementTypes.TEXTANNOTATION;
}
