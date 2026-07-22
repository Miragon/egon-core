import { IconStyleSheetPort } from "../domain/ports/IconStyleSheetPort";

/**
 * Infrastructure adapter that turns an icon's CSS class + SVG into a live rule
 * on the shared `#iconsCss` stylesheet. This is the DOM/CSSOM half the icon
 * service must not own: the browser-only `btoa`, the SVG attribute reshaping,
 * and the `insertRule` call live here, behind {@link IconStyleSheetPort}.
 */
export class IconCssInjector implements IconStyleSheetPort {
    addIconStyle(cssClassName: string, svgMarkup: string): void {
        // Looked up per call (not cached in the constructor) because the
        // `<style id="iconsCss">` element is created later, by
        // DiagramJsModelerAdapter.initializeContainer(); an early adapter would
        // otherwise bind to a null sheet forever.
        const sheetEl = document.getElementById("iconsCss");

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

        // getElementById types the node as HTMLElement; the "iconsCss"
        // node is a <style> element, so cast to reach its CSSOM sheet.
        // Typing it properly (vs. @ts-expect-error) keeps the suppression
        // from breaking when Prettier wraps this call across lines.
        const styleSheet = (sheetEl as HTMLStyleElement | null)?.sheet;
        if (styleSheet) {
            // Silent no-op when the sheet is absent: icons loaded before the
            // canvas mounts simply have no rule yet, which is expected.
            styleSheet.insertRule(iconStyle, styleSheet.cssRules.length);
        }
    }
}
