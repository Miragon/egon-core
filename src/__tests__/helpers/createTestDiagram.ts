import type { ModuleDeclaration } from "didi";

import { EgonClient } from "../../modeler/service/EgonClient";
import type { EgonClientConfig } from "../../modeler/service/EgonClientConfig";

/** A booted client plus the DOM it lives in and a teardown handle. */
export interface TestDiagram {
    client: EgonClient;
    container: HTMLElement;
    cleanup: () => void;
}

/**
 * Boots a real {@link EgonClient} against a freshly attached container.
 *
 * This is browser-tier only: a genuine boot renders through diagram-js, which
 * measures SVG via `getBBox`. jsdom returns zeros there, so the canvas never
 * lays out — only a real browser (vitest browser mode) exercises the full
 * bootstrap. Unit specs must keep mocking the ports instead.
 *
 * By default the container is sized and attached to `document.body` because
 * diagram-js reads its dimensions on init; `cleanup()` destroys the client and
 * detaches that owned node. A supplied `existingContainer` stays caller-owned,
 * which lets isolation specs boot multiple clients into one real host.
 */
export async function createTestDiagram(
    config: Partial<Omit<EgonClientConfig, "container">> = {},
    additionalModules: ModuleDeclaration[] = [],
    existingContainer?: HTMLElement,
): Promise<TestDiagram> {
    const ownsContainer = !existingContainer;
    const container = existingContainer ?? document.createElement("div");
    if (ownsContainer) {
        container.style.width = "800px";
        container.style.height = "600px";
        document.body.appendChild(container);
    }

    const client = await EgonClient.create(
        { container, ...config },
        additionalModules,
    );

    return {
        client,
        container,
        cleanup: () => {
            client.destroy();
            if (ownsContainer) container.remove();
        },
    };
}
