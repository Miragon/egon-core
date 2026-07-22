export function sanitizeTextForSVGExport(str: string): string {
    return str.replaceAll("--", "––");
}

// sanitize user-Input to be Desktop-Filename safe
export function sanitizeForDesktop(str: string): string {
    const map: { [key: string]: string } = {
        "/": "",
        "\\": "",
        ":": "",
        "*": "",
        "?": "",
        '"': "",
        "<": "",
        ">": "",
        "|": "",
    };
    const reg = /[/\\:*?"<>|]/gi;
    return str
        ? sanitizeTextForSVGExport(str.replace(reg, (match) => map[match]))
        : "";
}

/**
 * Icon names become CSS class names for the palette/context-pad. Characters
 * with CSS meaning (".", ":", spaces, …) would break the selector, so every
 * char outside [a-zA-Z0-9_-] becomes "_", a leading digit (or "-<digit>")
 * gets a "_" prefix, and the result is lowercased for stable matching.
 */
export function sanitizeForCss(name: string): string {
    return name
        .replace(/[^a-zA-Z0-9_-]/g, "_")
        .replace(/^(-?\d)/, "_$1")
        .toLowerCase();
}
