import { afterEach, describe, expect, it } from "vitest";
import Diagram from "diagram-js";
import type Canvas from "diagram-js/lib/core/Canvas";
import type { ModuleDeclaration } from "didi";

import ContextPadModule from "../context-pad";
import EditorActionsModule from "../editor-actions";
import PopupModule from "../popup";
import UpdateHandlerModule from "../update-handler";

/**
 * Every feature module must boot alone: `plugin.ts` loads them together, which
 * hides an under-declared `__depends__` from hosts that compose a subset.
 *
 * Unit tier despite a real `Diagram` (ADR TST-2): nothing reaches
 * `canvas.addShape`, so jsdom is enough.
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

    /** `domainStoryIconStyleSheet` is host config that `IconCssInjector` needs. */
    function bootStandalone(module: ModuleDeclaration): Diagram {
        const container = document.createElement("div");
        document.body.appendChild(container);
        containers.push(container);

        const styleElement = document.createElement("style");
        container.appendChild(styleElement);

        const diagram = new Diagram({
            canvas: { container },
            domainStoryIconStyleSheet: {
                styleElement,
                scopeId: "standalone-module",
            },
            modules: [module],
        });
        diagram
            .get<Canvas>("canvas")
            .getContainer()
            .setAttribute("data-egon-icon-scope", "standalone-module");
        booted.push(diagram);
        return diagram;
    }

    it("boots editor-actions alone and resolves every token it injects", () => {
        const diagram = bootStandalone(EditorActionsModule);

        expect(diagram.get("domainStoryEditorActions")).toBeDefined();
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
        // Provided by the popup module.
        expect(diagram.get("domainStoryNumberingRegistry")).toBeDefined();
    });

    it("boots update-handler alone and registers its command handlers", () => {
        const diagram = bootStandalone(UpdateHandlerModule);

        expect(diagram.get("domainStoryUpdateHandler")).toBeDefined();
        // `registerHandler` instantiates handlers during `__init__`, so booting
        // at all proves the provider is there.
        expect(diagram.get("domainStoryNumberingRegistry")).toBeDefined();
    });

    it("boots popup alone", () => {
        const diagram = bootStandalone(PopupModule);

        expect(diagram.get("domainStoryNumberingRegistry")).toBeDefined();
        expect(diagram.get("domainStoryActivityNumbering")).toBeDefined();
        expect(diagram.get("domainStoryNumberingUi")).toBeDefined();
    });
});
