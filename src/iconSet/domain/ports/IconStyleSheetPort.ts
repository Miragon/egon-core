/**
 * Port through which the icon service publishes an icon's presentation without
 * owning any DOM or CSSOM detail itself. The service knows *which* CSS class an
 * icon maps to (the issue-#4 regression pins that class == the published rule);
 * it must not know *how* that class becomes a live stylesheet rule — SVG
 * reshaping, base64 encoding, `<style>` lookup, and `insertRule` are outer-layer
 * concerns. Keeping this interface import-free lets the domain-purity rules in
 * `architecture.spec.ts` hold: an infrastructure adapter implements it and is
 * injected at runtime (service name `domainStoryIconStyleSheet`).
 */
export interface IconStyleSheetPort {
    /**
     * Publish or replace the CSS rule that renders `svgMarkup` as the mask-image
     * for the given already-computed `cssClassName` (prefix + sanitized icon
     * name).
     */
    addIconStyle(cssClassName: string, svgMarkup: string): void;
}
