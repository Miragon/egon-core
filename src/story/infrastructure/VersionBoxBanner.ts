import { html, render } from "diagram-js/lib/ui";
import Canvas from "diagram-js/lib/core/Canvas";
import EventBus from "diagram-js/lib/core/EventBus";
import VersionBox from "../../shared/infrastructure/ui/VersionBox";
import { VersionBannerPort } from "../domain/ports/VersionBannerPort";

/**
 * Infrastructure adapter that renders the imported story's version as a floating
 * VersionBox. This is the DOM half the import service must not own: locating the
 * instance's canvas and the diagram-js `html`/`render` call live here, behind
 * {@link VersionBannerPort}.
 */
export class VersionBoxBanner implements VersionBannerPort {
    static $inject: string[] = ["canvas", "eventBus"];

    private mount: HTMLElement | null = null;

    constructor(
        private readonly canvas: Canvas,
        eventBus: EventBus,
    ) {
        eventBus.on("diagram.destroy", this.destroy);
    }

    show(version: string): void {
        if (!this.mount) {
            this.mount = document.createElement("div");
            this.mount.setAttribute("data-version-banner-mount", "true");
            this.canvas.getContainer().appendChild(this.mount);
        }

        render(html`<${VersionBox} version=${version} />`, this.mount);
    }

    private destroy = () => {
        if (!this.mount) return;

        render(null, this.mount);
        this.mount.remove();
        this.mount = null;
    };
}
