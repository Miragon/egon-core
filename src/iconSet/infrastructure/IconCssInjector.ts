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
}

/**
 * Infrastructure adapter that turns an icon's CSS class + SVG into a live rule
 * on this instance's icon stylesheet. This is the DOM/CSSOM half the icon
 * service must not own: the browser-only `btoa`, the SVG attribute reshaping,
 * and publication through the owned `<style>` node live here, behind
 * {@link IconStyleSheetPort}.
 *
 * The node is per-EgonClient, created by `DiagramJsModelerAdapter` and injected
 * by reference, so two clients on one page never write into the same sheet.
 *
 * Note this buys *ownership*, not isolation: the rules themselves are
 * document-global wherever the `<style>` sits, so two clients with different
 * SVGs for one icon name still collide. Real isolation needs selector
 * prefixing (`.egon-<id> .icon-x::before`) — that is issue #12, not this one.
 */
export class IconCssInjector implements IconStyleSheetPort {
    static $inject = ["config.domainStoryIconStyleSheet"];

    private readonly rulesByClass = new Map<string, string>();

    constructor(private readonly config?: IconStyleSheetConfig) {}

    addIconStyle(cssClassName: string, svgMarkup: string): void {
        const styleElement = this.config?.styleElement;
        if (!styleElement) {
            return;
        }

        // Remove width and height attributes from SVG tag to ensure consistent scaling
        const scalableSvg = svgMarkup.replace(/<svg[^>]+>/, (match: string) => {
            return match.replace(/ (width|height)="[^"]*"/g, "");
        });

        const base64Src = btoa(scalableSvg);

        const iconStyle = `
            .${cssClassName}::before {
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
