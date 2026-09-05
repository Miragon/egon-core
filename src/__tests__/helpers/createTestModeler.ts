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
    /** Icon set to load before any shape is created. Defaults to TEST_ICON_SET. */
    icons?: Partial<IconSetData>;
    additionalModules?: ModuleDeclaration[];
    /** Label typography overrides, as `EgonClientConfig.textRenderer` supplies them. */
    textRenderer?: DomainStoryTextRendererConfig;
    /** Existing host to share between modelers. Owned by the caller when set. */
    container?: HTMLElement;
}

/** A booted modeler plus the injector services canvas specs drive directly. */
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
    /** Escape hatch for services this interface does not name. */
    get<T>(token: string): T;
    cleanup(): void;
}

/**
 * Boots a real diagram-js graph and hands back its injector, for specs that
 * drive the commandStack rather than the public API.
 *
 * Browser-tier only — see ADR 0014. Anything that reaches `canvas.addShape`
 * needs `SVGSVGElement.createSVGTransform` and a non-zero `getBBox`, neither of
 * which jsdom implements, so a canvas-driving spec cannot run in the unit tier.
 *
 * Built **on `DiagramJsModelerAdapter`**, not a hand-rolled `new Diagram(...)`:
 * the adapter owns the production bootstrap — the `canvas: { container, width,
 * height }` nesting (whose absence was a real bug, #59), the per-instance
 * `[data-egon-icons-css]` node and the DI config that hands it to the icon
 * stylesheet adapter, and realizing the implicit canvas root (which
 * `isBackground` depends on). A
 * harness that boots differently would test a fiction. Icons load through the
 * production `DiagramJsIconAdapter` for the same reason.
 *
 * Sits beside {@link ../helpers/createTestDiagram.createTestDiagram}; neither
 * wraps the other. Use `createTestDiagram` for `EgonClient` public-API specs and
 * `createTestModeler` for injector/commandStack specs.
 *
 * Create one per `it` and `cleanup()` in `afterEach` — leaked canvases, not file
 * count, are what makes the browser tier slow.
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

    // Before any shape exists: the renderer resolves an actor's icon at draw
    // time and tiny-svg throws InvalidCharacterError on the "" a miss returns.
    // Held, not dropped: the adapter owns subscriptions and timers that
    // cleanup() must be able to disarm.
    const iconAdapter = new DiagramJsIconAdapter(diagram);
    iconAdapter.loadIcons(options.icons ?? TEST_ICON_SET);

    const get = <T>(token: string): T => diagram.get<T>(token);
    const canvas = get<Canvas>("canvas");

    return {
        diagram,
        container,
        // The adapter already realized the root; read it back rather than making
        // a second one, so harness and production agree on which root is live.
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
