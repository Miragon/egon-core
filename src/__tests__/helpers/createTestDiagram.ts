import type { ModuleDeclaration } from "didi";

import { EgonClient } from "../../modeler/service/EgonClient";
import type { EgonClientConfig } from "../../modeler/service/EgonClientConfig";

export interface TestDiagram {
    client: EgonClient;
    container: HTMLElement;
    cleanup: () => void;
}

/**
 * Browser-tier only: jsdom's `getBBox` returns zeros, so the canvas never lays
 * out. An owned container is sized because diagram-js reads its dimensions on
 * init. A supplied one stays caller-owned, so isolation specs can share a host.
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
