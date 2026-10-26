import type Diagram from "diagram-js";
import type { ModuleDeclaration } from "didi";
import type Canvas from "diagram-js/lib/core/Canvas";
import type CommandStack from "diagram-js/lib/command/CommandStack";
import type ElementRegistry from "diagram-js/lib/core/ElementRegistry";
import type EventBus from "diagram-js/lib/core/EventBus";
import type Rules from "diagram-js/lib/features/rules/Rules";
import type { Root } from "diagram-js/lib/model/Types";

import { DiagramJsModelerAdapter } from "../../modeler/infrastructure/DiagramJsModelerAdapter";
import { DiagramJsIconAdapter } from "../../modeler/infrastructure/DiagramJsIconAdapter";
import type { DomainStoryElementFactory } from "../../modeler/infrastructure/element-factory/DomainStoryElementFactory";
import type { DomainStoryModeling } from "../../modeler/infrastructure/modeling/DomainStoryModeling";
import type { IconSetData } from "../../iconSet/domain/IconTypes";
import type { DomainStoryTextRendererConfig } from "../../modeler/domain/model/TextRendererConfig";

import { TEST_ICON_SET } from "./testIconSet";

export interface TestModelerOptions {
    /** Defaults to TEST_ICON_SET. */
    icons?: Partial<IconSetData>;
    additionalModules?: ModuleDeclaration[];
    textRenderer?: DomainStoryTextRendererConfig;
    /** Shared between modelers; owned by the caller when set. */
    container?: HTMLElement;
}

export interface TestModeler {
    diagram: Diagram;
    container: HTMLElement;
    root: Root;
    canvas: Canvas;
    commandStack: CommandStack;
    elementFactory: DomainStoryElementFactory;
    elementRegistry: ElementRegistry;
    eventBus: EventBus;
    modeling: DomainStoryModeling;
    rules: Rules;
    get<T>(token: string): T;
    cleanup(): void;
}

/**
 * For specs that drive the commandStack; public-API specs use
 * `createTestDiagram`. Browser-tier only (ADR TST-2): jsdom lacks
 * `createSVGTransform` and a non-zero `getBBox`.
 *
 * Boots through the production adapters, which own the canvas nesting, the
 * icon stylesheet node and the implicit root; any other boot would test a
 * fiction. Create one per `it` and `cleanup()` in `afterEach`: leaked canvases
 * are what make the browser tier slow.
 */
export function createTestModeler(
    options: TestModelerOptions = {},
): TestModeler {
    const ownsContainer = !options.container;
    const container = options.container ?? document.createElement("div");
    if (ownsContainer) {
        container.style.width = "800px";
        container.style.height = "600px";
        document.body.appendChild(container);
    }

    const adapter = new DiagramJsModelerAdapter(
        container,
        "100%",
        "100%",
        options.additionalModules ?? [],
        options.textRenderer,
    );
    const diagram = adapter.getDiagram();

    // Before any shape exists: tiny-svg throws on the "" a missed icon returns.
    // Kept so cleanup() can disarm the adapter's subscriptions and timers.
    const iconAdapter = new DiagramJsIconAdapter(diagram);
    iconAdapter.loadIcons(options.icons ?? TEST_ICON_SET);

    const get = <T>(token: string): T => diagram.get<T>(token);
    const canvas = get<Canvas>("canvas");

    return {
        diagram,
        container,
        // Read back, not created, so harness and production share the live root.
        root: canvas.getRootElement() as Root,
        canvas,
        commandStack: get<CommandStack>("commandStack"),
        elementFactory: get<DomainStoryElementFactory>("elementFactory"),
        elementRegistry: get<ElementRegistry>("elementRegistry"),
        eventBus: get<EventBus>("eventBus"),
        modeling: get<DomainStoryModeling>("modeling"),
        rules: get<Rules>("rules"),
        get,
        cleanup: () => {
            // Icon port before modeler port, mirroring EgonClient.destroy().
            iconAdapter.destroy();
            adapter.destroy();
            if (ownsContainer) container.remove();
        },
    };
}
