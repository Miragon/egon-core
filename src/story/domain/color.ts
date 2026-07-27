/**
 * The notation's element colour and what counts as "no choice made".
 *
 * WHY it is domain code and not a renderer constant: `pickedColor` is the
 * *user's* choice and is nullable — absent means "the renderer decides" (#65).
 * Deciding whether a persisted value expresses that default is notation
 * knowledge that the renderer, the colour picker and any future export check all
 * need, so it lives next to the other pure element rules rather than inside the
 * diagram-js adapter.
 */

/** The colour every element is drawn in when the user picked none. */
export const DEFAULT_COLOR = "#000000";

/**
 * Every literal historical Egon.io versions have written for the default.
 *
 * `"black"` is the load-bearing entry: before #65 the renderer stamped that
 * keyword onto activities, so files saved by those versions persist it. A plain
 * `color !== DEFAULT_COLOR` therefore reads such a file as a *custom* colour —
 * which is what made `getIconSvg` fire a bogus "only SVG icons can be coloured"
 * error for a raster custom icon in an old story (#74).
 */
const DEFAULT_COLOR_LITERALS: readonly string[] = ["black", "#000", "#000000"];

/**
 * Whether `color` means "the default", i.e. the user expressed no choice.
 *
 * Falsy inputs count as default on purpose: `undefined`/`null` is the normal
 * "never picked" state, and an empty string is not a colour anyone chose — the
 * predecessor guard (`pickedColor && pickedColor !== DEFAULT_COLOR`) treated it
 * the same way. Comparison is case-insensitive because the shorthand forms were
 * hand-written in places.
 */
export function isDefaultColor(color?: string | null): boolean {
    if (!color) {
        return true;
    }
    return DEFAULT_COLOR_LITERALS.includes(color.trim().toLowerCase());
}
