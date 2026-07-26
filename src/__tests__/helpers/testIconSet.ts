import type { IconSetData } from "../../iconSet/domain/IconTypes";

/**
 * The icon set every canvas-driving spec loads before creating shapes.
 *
 * Mandatory, not cosmetic. `DomainStoryRenderer.drawActor` resolves the icon
 * through `IconDictionaryService.getIconSource()`, which answers `""` on a miss,
 * and hands that straight to tiny-svg's `create()` — which throws
 * `InvalidCharacterError` on an empty string. An actor created without a
 * registered icon therefore fails in the renderer with an error that names
 * neither the element nor the icon.
 *
 * Each icon carries an explicit `fill=` attribute so the recolour path in
 * `applyColorToIcon` takes its *first* branch (regex match → replaceAll) rather
 * than the fallback that splices a `fill` in after `<svg `. Colour-change and
 * paste-colour specs are only meaningful against the branch real icon sets hit.
 */
export const TEST_ICON_NAMES = {
    person: "Person",
    group: "Group",
    document: "Document",
    folder: "Folder",
} as const;

/** A square icon with a paintable `fill`; `viewBox` keeps it scalable. */
function squareIcon(fill: string): string {
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">' +
        `<rect x="2" y="2" width="20" height="20" fill="${fill}"/>` +
        "</svg>"
    );
}

/** A round icon, so actors and work objects are visually distinguishable. */
function circleIcon(fill: string): string {
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">' +
        `<circle cx="12" cy="12" r="10" fill="${fill}"/>` +
        "</svg>"
    );
}

export const TEST_ICON_SET: IconSetData = {
    name: "test-icons",
    actors: {
        [TEST_ICON_NAMES.person]: circleIcon("#1f77b4"),
        [TEST_ICON_NAMES.group]: circleIcon("#ff7f0e"),
    },
    workObjects: {
        [TEST_ICON_NAMES.document]: squareIcon("#2ca02c"),
        [TEST_ICON_NAMES.folder]: squareIcon("#d62728"),
    },
};
