export function sanitizeTextForSVGExport(str: string): string {
    return str
        .replaceAll("--", "––")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;");
}

/**
 * Reverses `sanitizeTextForSVGExport`. Deliberately narrow and lossy: literal
 * `&lt;`/`&gt;` and en-dash pairs are indistinguishable from sanitized text.
 */
export function unsanitizeTextForSVGExport(str: string): string {
    return str
        .replaceAll("&lt;", "<")
        .replaceAll("&gt;", ">")
        .replaceAll("––", "--");
}

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
 * Icon names become palette/context-pad class names, and characters with CSS
 * meaning would break the selector: anything outside [a-zA-Z0-9_-] becomes "_",
 * a leading digit (or "-<digit>") gets a "_" prefix, and the result is
 * lowercased.
 */
export function sanitizeForCss(name: string): string {
    return name
        .replace(/[^a-zA-Z0-9_-]/g, "_")
        .replace(/^(-?\d)/, "_$1")
        .toLowerCase();
}
