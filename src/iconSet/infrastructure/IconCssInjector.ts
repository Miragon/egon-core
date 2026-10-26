import { IconStyleSheetPort } from "../domain/ports/IconStyleSheetPort";

/**
 * Declared here, not in the domain (it is a DOM type) nor on the service barrel
 * (a cross-feature edge for a single field).
 */
export interface IconStyleSheetConfig {
    styleElement?: HTMLStyleElement;
    scopeId?: string;
}

/**
 * The DOM/CSSOM half of {@link IconStyleSheetPort}. Node and scope are per
 * editor session (from `EditorSessionOwner`) and every rule is scoped to it, so
 * clients sharing one document may reuse icon class names.
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

        // Without width/height the mask scales consistently.
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
        // `textContent`, unlike `.sheet`, works while detached, so the rules go
        // live whenever a host attaches the node.
        styleElement.textContent = Array.from(this.rulesByClass.values()).join(
            "\n",
        );
    }
}
