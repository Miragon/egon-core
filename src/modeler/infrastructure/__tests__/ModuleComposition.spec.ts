import { afterEach, describe, expect, it } from "vitest";
import Diagram from "diagram-js";
import type { ModuleDeclaration } from "didi";

import ContextPadModule from "../context-pad";
import EditorActionsModule from "../editor-actions";
import PopupModule from "../popup";
import UpdateHandlerModule from "../update-handler";

/**
 * Regression lock for issue #83: every feature module must compose on its own.
 *
 * WHY this can be missed by every other spec: `plugin.ts` lists all of them at
 * once, so a module whose `__depends__` under-declares its `$inject` tokens
 * still resolves — its dependencies happen to be in the injector because a
 * sibling pulled them in. The failure only appears for a host that composes a
 * subset (the WPS web app end goal), as a didi "No provider" throw. Booting each
 * module alone is the only thing that proves the declarations are complete.
 *
 * WHY unit tier despite driving a real `Diagram` (ADR 0014): nothing here
 * reaches `canvas.addShape`, so jsdom is enough. `__init__` services and the
 * tokens read back via `diagram.get` are all constructed at boot.
 */
describe("standalone module composition", () => {
    let booted: Diagram[] = [];
    let containers: HTMLElement[] = [];

    afterEach(() => {
        booted.forEach((diagram) => diagram.destroy());
        containers.forEach((container) => container.remove());
        booted = [];
        containers = [];
    });

    /**
     * Boots one module the way a host would — nothing else in the module list.
     * `domainStoryIconStyleSheet` rides along because modules that transitively
     * pull `IconCssInjector` take the host's `<style>` node through DI, exactly
     * as `DiagramJsModelerAdapter` supplies it.
     */
    function bootStandalone(module: ModuleDeclaration): Diagram {
        const container = document.createElement("div");
        document.body.appendChild(container);
        containers.push(container);

        const styleElement = document.createElement("style");
        container.appendChild(styleElement);

        const diagram = new Diagram({
            canvas: { container },
            domainStoryIconStyleSheet: { styleElement },
            modules: [module],
        });
        booted.push(diagram);
        return diagram;
    }

    it("boots editor-actions alone and resolves every token it injects", () => {
        const diagram = bootStandalone(EditorActionsModule);

        expect(diagram.get("domainStoryEditorActions")).toBeDefined();
        // The five tokens `DomainStoryEditorActions.$inject` named while only
        // `handTool`'s module was declared.
        expect(diagram.get("editorActions")).toBeDefined();
        expect(diagram.get("selection")).toBeDefined();
        expect(diagram.get("spaceTool")).toBeDefined();
        expect(diagram.get("lassoTool")).toBeDefined();
        expect(diagram.get("directEditing")).toBeDefined();
    });

    it("boots context-pad alone and resolves the numbering registry", () => {
        const diagram = bootStandalone(ContextPadModule);

        expect(diagram.get("domainStoryContextPadProvider")).toBeDefined();
        expect(diagram.get("contextPad")).toBeDefined();
        // Provided by the popup module, which context-pad had not declared.
        expect(diagram.get("domainStoryNumberingRegistry")).toBeDefined();
    });

    it("boots update-handler alone and registers its command handlers", () => {
        const diagram = bootStandalone(UpdateHandlerModule);

        expect(diagram.get("domainStoryUpdateHandler")).toBeDefined();
        // `CommandStack.registerHandler` instantiates the handler class eagerly,
        // so `ActivityChangedHandler`'s injection of this token runs inside
        // `DomainStoryUpdateHandler`'s constructor — i.e. during `__init__`.
        // Booting at all is therefore the proof that the provider is there.
        expect(diagram.get("domainStoryNumberingRegistry")).toBeDefined();
    });

    it("boots popup alone", () => {
        const diagram = bootStandalone(PopupModule);

        expect(diagram.get("domainStoryNumberingRegistry")).toBeDefined();
        expect(diagram.get("domainStoryActivityNumbering")).toBeDefined();
        expect(diagram.get("domainStoryNumberingUi")).toBeDefined();
    });
});
