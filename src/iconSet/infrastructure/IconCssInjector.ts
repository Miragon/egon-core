import { IconStyleSheetPort } from "../domain/ports/IconStyleSheetPort";

/**
 * The `<style>` node this injector writes into, handed in through diagram-js'
 * DI config (`config.domainStoryIconStyleSheet`).
 *
 * Declared here rather than in `iconSet/domain/` — `HTMLStyleElement` is a DOM
 * type and domain folders must stay framework-free — and not on the service
 * barrel, which would add a cross-feature edge for a single field.
 */
export interface IconStyleSheetConfig {
    styleElement?: HTMLStyleElement;
    scopeId?: string;
}

/**
 * Infrastructure adapter that turns an icon's CSS class + SVG into a live rule
 * on this instance's icon stylesheet. This is the DOM/CSSOM half the icon
 * service must not own: the browser-only `btoa`, the SVG attribute reshaping,
 * and publication through the owned `<style>` node live here, behind
 * {@link IconStyleSheetPort}.
 *
 * The node and selector scope are per editor session, created by
 * `EditorSessionOwner` and injected by reference. Every rule is anchored to
 * that session's `.djs-container`, so clients may safely reuse icon class names
 * even when their stylesheets share one host or document.
 */
export class IconCssInjector implements IconStyleSheetPort {
    static $inject = ["config.domainStoryIconStyleSheet"];

    private readonly rulesByClass = new Map<string, string>();

    constructor(private readonly config?: IconStyleSheetConfig) {}

    addIconStyle(cssClassName: string, svgMarkup: string): void {
        const styleElement = this.config?.styleElement;
        const scopeId = this.config?.scopeId;
        if (!styleElement || !scopeId) {
            return;
        }

        // Remove width and height attributes from SVG tag to ensure consistent scaling
        const scalableSvg = svgMarkup.replace(/<svg[^>]+>/, (match: string) => {
            return match.replace(/ (width|height)="[^"]*"/g, "");
        });

        const bytes = new TextEncoder().encode(scalableSvg);
        let binary = "";
        for (const byte of bytes) {
            binary += String.fromCharCode(byte);
        }
        const base64Src = btoa(binary);

        const iconStyle = `
            [data-egon-icon-scope="${scopeId}"] .${cssClassName}::before {
              mask-image: url('data:image/svg+xml;base64,${base64Src}');
            }
        `;

        if (this.rulesByClass.get(cssClassName) === iconStyle) {
            return;
        }

        this.rulesByClass.set(cssClassName, iconStyle);
        // textContent is available while detached, unlike `.sheet`. Keeping the
        // complete owned rule set on the node makes it live automatically when
        // a host attaches or reattaches that node.
        styleElement.textContent = Array.from(this.rulesByClass.values()).join(
            "\n",
        );
    }
}
