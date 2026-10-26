/**
 * The icon service decides which CSS class an icon maps to, not how it becomes
 * a live rule. Implemented in infrastructure and injected as
 * `domainStoryIconStyleSheet`.
 */
export interface IconStyleSheetPort {
    /** `cssClassName` is already computed (prefix + sanitized icon name). */
    addIconStyle(cssClassName: string, svgMarkup: string): void;
}
