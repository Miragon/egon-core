export function sanitizeTextForSVGExport(str: string): string {
    return str
        .replaceAll("--", "––")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;");
}

/**
 * Reverses the legacy substitutions made by `sanitizeTextForSVGExport`.
 *
 * This mapping is intentionally narrow and lossy: literal `&lt;`/`&gt;` entities
 * and literal en-dash pairs cannot be distinguished from sanitized text. It is
 * not a general-purpose XML decoder.
 */
export function unsanitizeTextForSVGExport(str: string): string {
    return str
        .replaceAll("&lt;", "<")
        .replaceAll("&gt;", ">")
        .replaceAll("––", "--");
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
