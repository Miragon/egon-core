import Diagram from "diagram-js";
import type { ModuleDeclaration } from "didi";
import type Canvas from "diagram-js/lib/core/Canvas";
import type EventBus from "diagram-js/lib/core/EventBus";

import EgonPlugin from "./plugin";
import {
    DomainStoryImportService,
    DomainStoryExportService,
} from "../../story/service";
import {
    createDebouncedCallback,
    type DebouncedCallback,
} from "../../shared/infrastructure/debounce";

import { ImportRepairData, ModelerPort } from "../domain/ports";
import {
    DomainStoryDocument,
    DomainStoryTextRendererConfig,
    ViewportData,
} from "../domain";

/**
 * Infrastructure adapter that implements ModelerPort using diagram-js.
 * This adapter isolates all diagram-js framework dependencies.
 */
export class DiagramJsModelerAdapter implements ModelerPort {
    private readonly diagram: Diagram;
    private readonly eventBus: EventBus;
    private readonly canvas: Canvas;
    private readonly iconStyleElement: HTMLStyleElement;

    // Two maps, not one union-keyed map: `EgonEventMap` makes a zero-arg
    // callback assignable to both events, so `on("story.changed", f)` followed
    // by `on("viewport.changed", f)` typechecks — with a single map the second
    // registration would overwrite the first handle, leaving an uncancellable
    // timer alive past destroy(). That is the very defect #69 removes.
    private readonly storyCallbacks: Map<() => void, DebouncedCallback> =
        new Map();
    private readonly viewportCallbacks: Map<
        (viewport: ViewportData) => void,
        DebouncedCallback
    > = new Map();
    // Undebounced, so the map holds the wrapper itself: an import is one
    // discrete host-triggered action that fires this at most once, and delaying
    // "your file was lossy" past the import returning would be a regression, not
    // a coalescing win.
    private readonly importRepairCallbacks: Map<
        (repair: ImportRepairData) => void,
        (event: any) => void
    > = new Map();

    constructor(
        container: HTMLElement,
        width: string,
        height: string,
        additionalModules: ModuleDeclaration[] = [],
        textRenderer?: DomainStoryTextRendererConfig,
    ) {
        // Must exist before `new Diagram`: IconCssInjector is constructed during
        // boot (IconDictionaryService.$inject) and takes the node by reference.
        this.iconStyleElement = this.createIconStyleElement(container);

        // diagram-js injects `config.canvas` into its Canvas, so container/size
        // must be nested under `canvas` — passed at the top level they are
        // silently ignored and the canvas renders into document.body instead of
        // the host-provided element, breaking multi-instance isolation.
        // `domainStoryIconStyleSheet` rides the same mechanism to hand this
        // instance's own <style> node to its own IconCssInjector, and
        // `textRenderer` to reach `config.textRenderer` in the text renderer.
        // The key is omitted when the host supplied nothing, so didi hands the
        // renderer `undefined` and its built-in defaults stand.
        this.diagram = new Diagram({
            canvas: { container, width, height },
            domainStoryIconStyleSheet: { styleElement: this.iconStyleElement },
            ...(textRenderer ? { textRenderer } : {}),
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
        // Built once and reused for every event: a debouncer created per event
        // shares no timer with the previous one, so nothing coalesces and each
        // command reaches the host a full window late.
        const wrapped = createDebouncedCallback(() => callback());
        this.storyCallbacks.set(callback, wrapped);
        (this.eventBus.on as any)("commandStack.changed", wrapped);
    }

    onViewportChanged(callback: (viewport: ViewportData) => void): void {
        const wrapped = createDebouncedCallback((event: any) =>
            callback(event.viewbox),
        );
        this.viewportCallbacks.set(callback, wrapped);
        (this.eventBus.on as any)("canvas.viewbox.changed", wrapped);
    }

    onImportRepaired(callback: (repair: ImportRepairData) => void): void {
        // The internal event carries the dropped business objects; only their
        // ids cross the port, so the model stays on this side of it.
        const wrapped = (event: any) =>
            callback({
                removedConnectionIds: (event.removedConnections ?? []).map(
                    (connection: { id: string }) => connection.id,
                ),
            });
        this.importRepairCallbacks.set(callback, wrapped);
        (this.eventBus.on as any)("dst.import.repaired", wrapped);
    }

    offStoryChanged(callback: () => void): void {
        const wrapped = this.storyCallbacks.get(callback);
        if (wrapped) {
            (this.eventBus.off as any)("commandStack.changed", wrapped);
            // Cancel too, or unsubscribing drops the only handle to an armed
            // timer and the host is still called ~100 ms after off().
            wrapped.cancel();
            this.storyCallbacks.delete(callback);
        }
    }

    offViewportChanged(callback: (viewport: ViewportData) => void): void {
        const wrapped = this.viewportCallbacks.get(callback);
        if (wrapped) {
            (this.eventBus.off as any)("canvas.viewbox.changed", wrapped);
            wrapped.cancel();
            this.viewportCallbacks.delete(callback);
        }
    }

    offImportRepaired(callback: (repair: ImportRepairData) => void): void {
        const wrapped = this.importRepairCallbacks.get(callback);
        if (wrapped) {
            (this.eventBus.off as any)("dst.import.repaired", wrapped);
            this.importRepairCallbacks.delete(callback);
        }
    }

    /**
     * Teardown order is deliberate: unsubscribe (and disarm) first, so no event
     * raised by diagram-js' own teardown — `diagram.destroy` fires
     * `canvas.destroy` on a still-live bus — can reach a host handler; then drop
     * the diagram; then remove the <style> node, which lives in the *host's*
     * container and so survives `diagram.destroy()`.
     */
    destroy(): void {
        this.unsubscribeAll();
        this.diagram.destroy();
        this.iconStyleElement.remove();
    }

    /** Expose diagram instance for IconAdapter to access services */
    getDiagram(): Diagram {
        return this.diagram;
    }

    /**
     * Creates this instance's own icon stylesheet node inside the host
     * container.
     *
     * Unconditional — no "already there?" guard: two clients sharing one
     * container must get two nodes, otherwise the second writes its icon rules
     * into the first's sheet and destroying either deletes rules the other
     * depends on. Marked by attribute rather than `id` for the same reason: ids
     * must be document-unique.
     */
    private createIconStyleElement(container: HTMLElement): HTMLStyleElement {
        const style = document.createElement("style");
        style.setAttribute("data-egon-icons-css", "");
        container.appendChild(style);
        return style;
    }

    /** Detaches and disarms every host subscription, all three event kinds. */
    private unsubscribeAll(): void {
        this.storyCallbacks.forEach((wrapped) => {
            (this.eventBus.off as any)("commandStack.changed", wrapped);
            wrapped.cancel();
        });
        this.storyCallbacks.clear();

        this.viewportCallbacks.forEach((wrapped) => {
            (this.eventBus.off as any)("canvas.viewbox.changed", wrapped);
            wrapped.cancel();
        });
        this.viewportCallbacks.clear();

        this.importRepairCallbacks.forEach((wrapped) => {
            (this.eventBus.off as any)("dst.import.repaired", wrapped);
        });
        this.importRepairCallbacks.clear();
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
}
