import Diagram from "diagram-js";
import type { ModuleDeclaration } from "didi";
import type Canvas from "diagram-js/lib/core/Canvas";
import type EventBus from "diagram-js/lib/core/EventBus";

import EgonPlugin from "./plugin";
import {
    DomainStoryImportService,
    DomainStoryExportService,
} from "../../story/service";

import { ModelerPort } from "../domain/ports";
import { DomainStoryDocument, ViewportData } from "../domain";

const DEFAULT_DEBOUNCE_MS = 100;

/**
 * Infrastructure adapter that implements ModelerPort using diagram-js.
 * This adapter isolates all diagram-js framework dependencies.
 */
export class DiagramJsModelerAdapter implements ModelerPort {
    private readonly diagram: Diagram;
    private readonly eventBus: EventBus;
    private readonly canvas: Canvas;
    private readonly callbackRegistry: Map<
        (() => void) | ((viewport: ViewportData) => void),
        (event?: unknown) => void
    > = new Map();

    constructor(
        container: HTMLElement,
        width: string,
        height: string,
        additionalModules: ModuleDeclaration[] = [],
    ) {
        this.initializeContainer(container);

        // diagram-js injects `config.canvas` into its Canvas, so container/size
        // must be nested under `canvas` — passed at the top level they are
        // silently ignored and the canvas renders into document.body instead of
        // the host-provided element, breaking multi-instance isolation.
        this.diagram = new Diagram({
            canvas: { container, width, height },
            modules: [EgonPlugin, ...additionalModules],
        });

        this.eventBus = this.diagram.get<EventBus>("eventBus");
        this.canvas = this.diagram.get<Canvas>("canvas");

        this.initializeRootElement();
    }

    import(document: DomainStoryDocument): void {
        const importService = this.diagram.get<DomainStoryImportService>(
            "domainStoryImportService",
        );
        importService.import(JSON.stringify(document));
    }

    export(): DomainStoryDocument {
        const exportService = this.diagram.get<DomainStoryExportService>(
            "domainStoryExportService",
        );
        return JSON.parse(exportService.export());
    }

    getViewport(): ViewportData {
        return this.canvas.viewbox();
    }

    setViewport(viewport: ViewportData): void {
        this.canvas.viewbox(viewport);
    }

    alignToOrigin(): void {
        this.diagram.get<{ align(): void }>("alignToOrigin").align();
    }

    fitToScreen(): void {
        this.alignToOrigin();
        // Public equivalent of upstream fitStoryToScreen's
        // canvas._fitViewport({ x: 0, y: 0 }): in diagram-js, zoom
        // "fit-viewport" delegates directly to _fitViewport(center).
        this.canvas.zoom("fit-viewport", { x: 0, y: 0 });
    }

    onStoryChanged(callback: () => void): void {
        const wrapped = (event: any) =>
            this.createDebouncedCallback(() => callback())(event);
        this.callbackRegistry.set(callback, wrapped);
        (this.eventBus.on as any)("commandStack.changed", wrapped);
    }

    onViewportChanged(callback: (viewport: ViewportData) => void): void {
        const wrapped = this.createDebouncedCallback((event: any) =>
            callback(event.viewbox),
        );
        this.callbackRegistry.set(callback, wrapped);
        (this.eventBus.on as any)("canvas.viewbox.changed", wrapped);
    }

    offStoryChanged(callback: () => void): void {
        const wrapped = this.callbackRegistry.get(callback);
        if (wrapped) {
            (this.eventBus.off as any)("commandStack.changed", wrapped);
            this.callbackRegistry.delete(callback);
        }
    }

    offViewportChanged(callback: (viewport: ViewportData) => void): void {
        const wrapped = this.callbackRegistry.get(callback);
        if (wrapped) {
            (this.eventBus.off as any)("canvas.viewbox.changed", wrapped);
            this.callbackRegistry.delete(callback);
        }
    }

    destroy(): void {
        this.callbackRegistry.clear();
        this.diagram.destroy();
    }

    /** Expose diagram instance for IconAdapter to access services */
    getDiagram(): Diagram {
        return this.diagram;
    }

    private initializeContainer(container: HTMLElement): void {
        if (!container.querySelector("#iconsCss")) {
            const style = document.createElement("style");
            style.id = "iconsCss";
            container.appendChild(style);
        }
    }

    /**
     * Realizes the canvas root eagerly, so every service that reads it at boot
     * sees the same element.
     *
     * It must be diagram-js' *implicit* root: `isBackground` (story/domain)
     * identifies the canvas background by the `__implicitroot` id prefix, as
     * upstream does. A root built via `elementFactory.createRoot()` instead gets
     * a `root_<n>` id from DomainStoryIdFactory, so `isBackground` answered
     * false for it — and `DomainStoryUpdater.updateElement` then took its
     * "group dropped onto a shape" branch for a group created on the bare
     * canvas, dereferencing `parent.parent` (undefined for a root) and throwing
     * `TypeError: Cannot read properties of undefined (reading 'children')`.
     * `getRootElement()` creates and installs the implicit root when none is set.
     */
    private initializeRootElement(): void {
        this.canvas.getRootElement();
    }

    private createDebouncedCallback(
        callback: (event?: unknown) => void,
    ): (event?: unknown) => void {
        let timeoutId: ReturnType<typeof setTimeout> | null = null;
        return (event?: unknown) => {
            if (timeoutId) clearTimeout(timeoutId);
            timeoutId = setTimeout(() => callback(event), DEFAULT_DEBOUNCE_MS);
        };
    }
}
