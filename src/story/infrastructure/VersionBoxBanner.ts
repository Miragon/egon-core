import { html, render } from "diagram-js/lib/ui";
import VersionBox from "../../shared/infrastructure/ui/VersionBox";
import { VersionBannerPort } from "../domain/ports/VersionBannerPort";

/**
 * Infrastructure adapter that renders the imported story's version as a floating
 * VersionBox. This is the DOM half the import service must not own: the
 * `#egon-io-container` lookup and the diagram-js `html`/`render` call live here,
 * behind {@link VersionBannerPort}. A missing container is a silent no-op —
 * hosts that do not mount the banner container simply get no banner.
 */
export class VersionBoxBanner implements VersionBannerPort {
    show(version: string): void {
        const parentElement = document.getElementById("egon-io-container");
        if (parentElement) {
            render(html` <${VersionBox} version=${version} />`, parentElement);
        }
    }
}
