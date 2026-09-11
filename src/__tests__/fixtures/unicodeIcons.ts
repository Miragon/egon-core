/**
 * Shared Unicode SVG fixture for the unit and real-browser icon regressions.
 *
 * The rectangle makes pixel checks independent of fonts. The text nodes still
 * exercise supplementary-plane emoji, CJK, Cyrillic, precomposed accents and
 * a decomposed combining mark at every SVG boundary that should preserve
 * character data.
 */
export const UNICODE_ICON_CONTENT = {
    title: "Director 🎬",
    description: "客户 Документ",
    text: "Crème brûlée",
    tspan: "你好 Привет",
    textPath: "Cafe\u0301 🚀",
    ariaLabel: "Rôle 🧑‍💻",
    dataLabel: "München 東京",
} as const;

export const UNICODE_ICON_GEOMETRY = {
    viewBox: "0 0 64 64",
    rect: "M4 4h56v56H4z",
    textPath: "M6 50H58",
} as const;

export const UNICODE_ICON_SVG =
    `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="${UNICODE_ICON_GEOMETRY.viewBox}" ` +
    `aria-label="${UNICODE_ICON_CONTENT.ariaLabel}" data-label="${UNICODE_ICON_CONTENT.dataLabel}">` +
    `<title>${UNICODE_ICON_CONTENT.title}</title>` +
    `<desc>${UNICODE_ICON_CONTENT.description}</desc>` +
    `<defs><path id="unicode-text-route" d="${UNICODE_ICON_GEOMETRY.textPath}"/></defs>` +
    `<path data-geometry="solid" d="${UNICODE_ICON_GEOMETRY.rect}" fill="#123456"/>` +
    `<text x="6" y="24" font-size="8">${UNICODE_ICON_CONTENT.text}` +
    `<tspan x="6" dy="10">${UNICODE_ICON_CONTENT.tspan}</tspan>` +
    `<textPath href="#unicode-text-route">${UNICODE_ICON_CONTENT.textPath}</textPath>` +
    `</text></svg>`;

export type SvgRepresentation = "raw" | "base64" | "percent";

export function encodeUtf8Base64(value: string): string {
    const bytes = new TextEncoder().encode(value);
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
}

export function decodeUtf8Base64(value: string): string {
    return new TextDecoder("utf-8", { fatal: true }).decode(
        Uint8Array.from(atob(value), (character) => character.charCodeAt(0)),
    );
}

export function unicodeIconSource(representation: SvgRepresentation): string {
    switch (representation) {
        case "raw":
            return UNICODE_ICON_SVG;
        case "base64":
            return `data:image/svg+xml;base64,${encodeUtf8Base64(UNICODE_ICON_SVG)}`;
        case "percent":
            return `data:image/svg+xml;utf8,${encodeURIComponent(UNICODE_ICON_SVG)}`;
    }
}
