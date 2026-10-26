import type { IconSetData } from "../../iconSet/domain/IconTypes";

/**
 * Mandatory: a missed icon resolves to `""`, and tiny-svg throws an
 * `InvalidCharacterError` that names neither element nor icon. Each icon has
 * an explicit `fill=` so `applyColorToIcon` takes the branch real icon sets hit.
 */
export const TEST_ICON_NAMES = {
    person: "Person",
    group: "Group",
    document: "Document",
    folder: "Folder",
} as const;

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
