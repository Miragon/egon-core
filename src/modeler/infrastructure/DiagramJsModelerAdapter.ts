import type Diagram from "diagram-js";
import type { ModuleDeclaration } from "didi";
import type Canvas from "diagram-js/lib/core/Canvas";
import type EventBus from "diagram-js/lib/core/EventBus";

import {
    DomainStoryImportService,
    DomainStoryExportService,
} from "../../story/service";
import {
    createDebouncedCallback,
    type DebouncedCallback,
} from "../../shared/infrastructure/debounce";
import { reportPostCommitError } from "../../shared/infrastructure/reportError";
import { EditorSession, EditorSessionOwner } from "./EditorSessionOwner";
import { IconDictionaryService } from "../../iconSet/service";

import {
    ColorPickerClosedData,
    ColorPickerRequestData,
    ImportRepairData,
    ModelerPort,
} from "../domain/ports";
import {
    DomainStoryDocument,
    DomainStoryTextRendererConfig,
    ViewportData,
} from "../domain";
import { ColorPickerCoordinator } from "./color-picker/ColorPickerCoordinator";

/** Project diagram-js' richer viewbox onto the stable public port shape. */
function projectViewport(viewbox: ViewportData): ViewportData {
    return {
        x: viewbox.x,
        y: viewbox.y,
        width: viewbox.width,
        height: viewbox.height,
    };
}

/**
 * Infrastructure adapter that implements ModelerPort using diagram-js.
 * This adapter isolates all diagram-js framework dependencies.
 */
export class DiagramJsModelerAdapter implements ModelerPort {
    private readonly sessionOwner: EditorSessionOwner;
    private importInProgress = false;
    private destroyed = false;

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
    private readonly colorPickerRequestedCallbacks = new Map<
        (request: ColorPickerRequestData) => void,
        (event: any) => void
    >();
    private readonly colorPickerClosedCallbacks = new Map<
        (closed: ColorPickerClosedData) => void,
        (event: any) => void
    >();

    constructor(
        container: HTMLElement,
        width: string,
        height: string,
        additionalModules: ModuleDeclaration[] = [],
        textRenderer?: DomainStoryTextRendererConfig,
    ) {
        this.sessionOwner = new EditorSessionOwner(
            container,
            width,
            height,
            additionalModules,
            textRenderer,
        );
    }

    import(document: DomainStoryDocument): void {
        if (this.importInProgress) {
            throw new Error("Cannot start a reentrant import");
        }

        this.importInProgress = true;
        let candidate: EditorSession | undefined;
        let committed = false;

        try {
            const active = this.sessionOwner.getActiveSession();
            const importService = active.diagram.get<DomainStoryImportService>(
                "domainStoryImportService",
            );
            const prepared = importService.prepare(document);
            const viewport = projectViewport(active.canvas.viewbox());

            candidate = this.sessionOwner.createCandidate();
            this.copyCustomIconPool(active, candidate);
            candidate.diagram
                .get<DomainStoryImportService>("domainStoryImportService")
                .materialize(prepared);
            candidate.canvas.viewbox(viewport);

            const previous = this.sessionOwner.promote(candidate);
            committed = true;
            // The old request remains valid throughout candidate staging. Only
            // a successful promotion expires it, while its old-bus callbacks
            // are still attached and can synchronously dismiss the host UI.
            try {
                this.getColorPickerCoordinator(previous).cancelActive();
            } catch (error) {
                reportPostCommitError(error);
            }
            try {
                this.transferSubscriptions(
                    previous.eventBus,
                    candidate.eventBus,
                );
            } catch (error) {
                reportPostCommitError(error);
            }

            // Candidate-local events prepared its palette/banner while hidden.
            // Repeat only the public notifications after listeners have moved.
            this.publishCommittedImport(candidate, prepared.removedConnections);

            try {
                this.sessionOwner.dispose(previous);
            } catch (error) {
                reportPostCommitError(error);
            }
        } catch (error) {
            if (committed) {
                reportPostCommitError(error);
                return;
            }
            if (candidate && !committed) {
                try {
                    this.sessionOwner.dispose(candidate);
                } catch (cleanupError) {
                    reportPostCommitError(cleanupError);
                }
            }
            throw error;
        } finally {
            this.importInProgress = false;
        }
    }

    export(): DomainStoryDocument {
        const exportService = this.getDiagram().get<DomainStoryExportService>(
            "domainStoryExportService",
        );
        return JSON.parse(exportService.export());
    }

    getViewport(): ViewportData {
        return projectViewport(this.getCanvas().viewbox());
    }

    setViewport(viewport: ViewportData): void {
        this.getCanvas().viewbox(viewport);
    }

    alignToOrigin(): void {
        this.getDiagram().get<{ align(): void }>("alignToOrigin").align();
    }

    fitToScreen(): void {
        this.alignToOrigin();
        // Public equivalent of upstream fitStoryToScreen's
        // canvas._fitViewport({ x: 0, y: 0 }): in diagram-js, zoom
        // "fit-viewport" delegates directly to _fitViewport(center).
        this.getCanvas().zoom("fit-viewport", { x: 0, y: 0 });
    }

    onStoryChanged(callback: () => void): void {
        if (this.storyCallbacks.has(callback)) {
            return;
        }
        // Built once and reused for every event: a debouncer created per event
        // shares no timer with the previous one, so nothing coalesces and each
        // command reaches the host a full window late.
        const wrapped = createDebouncedCallback(() => {
            try {
                callback();
            } catch (error) {
                reportPostCommitError(error);
            }
        });
        this.storyCallbacks.set(callback, wrapped);
        (this.getEventBus().on as any)("commandStack.changed", wrapped);
    }

    onViewportChanged(callback: (viewport: ViewportData) => void): void {
        if (this.viewportCallbacks.has(callback)) {
            return;
        }
        const wrapped = createDebouncedCallback((event: any) => {
            try {
                callback(projectViewport(event.viewbox));
            } catch (error) {
                reportPostCommitError(error);
            }
        });
        this.viewportCallbacks.set(callback, wrapped);
        (this.getEventBus().on as any)("canvas.viewbox.changed", wrapped);
    }

    onImportRepaired(callback: (repair: ImportRepairData) => void): void {
        if (this.importRepairCallbacks.has(callback)) {
            return;
        }
        // The internal event carries the dropped business objects; only their
        // ids cross the port, so the model stays on this side of it.
        const wrapped = (event: any) => {
            try {
                callback({
                    removedConnectionIds: (event.removedConnections ?? []).map(
                        (connection: { id: string }) => connection.id,
                    ),
                });
            } catch (error) {
                reportPostCommitError(error);
            }
        };
        this.importRepairCallbacks.set(callback, wrapped);
        (this.getEventBus().on as any)("dst.import.repaired", wrapped);
    }

    offStoryChanged(callback: () => void): void {
        const wrapped = this.storyCallbacks.get(callback);
        if (wrapped) {
            (this.getEventBus().off as any)("commandStack.changed", wrapped);
            // Cancel too, or unsubscribing drops the only handle to an armed
            // timer and the host is still called ~100 ms after off().
            wrapped.cancel();
            this.storyCallbacks.delete(callback);
        }
    }

    offViewportChanged(callback: (viewport: ViewportData) => void): void {
        const wrapped = this.viewportCallbacks.get(callback);
        if (wrapped) {
            (this.getEventBus().off as any)("canvas.viewbox.changed", wrapped);
            wrapped.cancel();
            this.viewportCallbacks.delete(callback);
        }
    }

    offImportRepaired(callback: (repair: ImportRepairData) => void): void {
        const wrapped = this.importRepairCallbacks.get(callback);
        if (wrapped) {
            (this.getEventBus().off as any)("dst.import.repaired", wrapped);
            this.importRepairCallbacks.delete(callback);
        }
    }

    onColorPickerRequested(
        callback: (request: ColorPickerRequestData) => void,
    ): void {
        if (this.colorPickerRequestedCallbacks.has(callback)) return;
        const wrapped = (event: any) => {
            try {
                callback({
                    requestId: event.requestId,
                    elementIds: [...event.elementIds],
                    color: event.color,
                });
            } catch (error) {
                reportPostCommitError(error);
            }
        };
        this.colorPickerRequestedCallbacks.set(callback, wrapped);
        (this.getEventBus().on as any)("dst.colorPicker.requested", wrapped);
    }

    onColorPickerClosed(
        callback: (closed: ColorPickerClosedData) => void,
    ): void {
        if (this.colorPickerClosedCallbacks.has(callback)) return;
        const wrapped = (event: any) => {
            try {
                callback({ requestId: event.requestId });
            } catch (error) {
                reportPostCommitError(error);
            }
        };
        this.colorPickerClosedCallbacks.set(callback, wrapped);
        (this.getEventBus().on as any)("dst.colorPicker.closed", wrapped);
    }

    offColorPickerRequested(
        callback: (request: ColorPickerRequestData) => void,
    ): void {
        const wrapped = this.colorPickerRequestedCallbacks.get(callback);
        if (!wrapped) return;
        (this.getEventBus().off as any)("dst.colorPicker.requested", wrapped);
        this.colorPickerRequestedCallbacks.delete(callback);
    }

    offColorPickerClosed(
        callback: (closed: ColorPickerClosedData) => void,
    ): void {
        const wrapped = this.colorPickerClosedCallbacks.get(callback);
        if (!wrapped) return;
        (this.getEventBus().off as any)("dst.colorPicker.closed", wrapped);
        this.colorPickerClosedCallbacks.delete(callback);
    }

    previewPickedColor(requestId: string, color: string): boolean {
        return (
            !this.destroyed &&
            this.getColorPickerCoordinator().preview(requestId, color)
        );
    }

    confirmPickedColor(requestId: string, color: string): boolean {
        return (
            !this.destroyed &&
            this.getColorPickerCoordinator().confirm(requestId, color)
        );
    }

    cancelColorPicker(requestId: string): boolean {
        return (
            !this.destroyed &&
            this.getColorPickerCoordinator().cancel(requestId)
        );
    }

    /**
     * Teardown order is deliberate: unsubscribe (and disarm) first, so no event
     * raised by diagram-js' own teardown — `diagram.destroy` fires
     * `canvas.destroy` on a still-live bus — can reach a host handler; then drop
     * the diagram; then remove the <style> node, which lives in the *host's*
     * container and so survives `diagram.destroy()`.
     */
    destroy(): void {
        this.destroyed = true;
        this.unsubscribeAll();
        this.sessionOwner.destroy();
    }

    /** Expose diagram instance for IconAdapter to access services */
    getDiagram(): Diagram {
        return this.sessionOwner.getActiveDiagram();
    }

    /** Internal active-session provider used by the icon adapter. */
    getSessionOwner(): EditorSessionOwner {
        return this.sessionOwner;
    }

    /** Detaches and disarms every host subscription. */
    private unsubscribeAll(): void {
        this.storyCallbacks.forEach((wrapped) => {
            (this.getEventBus().off as any)("commandStack.changed", wrapped);
            wrapped.cancel();
        });
        this.storyCallbacks.clear();

        this.viewportCallbacks.forEach((wrapped) => {
            (this.getEventBus().off as any)("canvas.viewbox.changed", wrapped);
            wrapped.cancel();
        });
        this.viewportCallbacks.clear();

        this.importRepairCallbacks.forEach((wrapped) => {
            (this.getEventBus().off as any)("dst.import.repaired", wrapped);
        });
        this.importRepairCallbacks.clear();

        this.colorPickerRequestedCallbacks.forEach((wrapped) => {
            (this.getEventBus().off as any)(
                "dst.colorPicker.requested",
                wrapped,
            );
        });
        this.colorPickerRequestedCallbacks.clear();

        this.colorPickerClosedCallbacks.forEach((wrapped) => {
            (this.getEventBus().off as any)("dst.colorPicker.closed", wrapped);
        });
        this.colorPickerClosedCallbacks.clear();
    }

    private getCanvas(): Canvas {
        return this.sessionOwner.getActiveSession().canvas;
    }

    private getEventBus(): EventBus {
        return this.sessionOwner.getActiveSession().eventBus;
    }

    private transferSubscriptions(previous: EventBus, current: EventBus): void {
        this.storyCallbacks.forEach((wrapped) => {
            (previous.off as any)("commandStack.changed", wrapped);
            wrapped.cancel();
            (current.on as any)("commandStack.changed", wrapped);
        });
        this.viewportCallbacks.forEach((wrapped) => {
            (previous.off as any)("canvas.viewbox.changed", wrapped);
            wrapped.cancel();
            (current.on as any)("canvas.viewbox.changed", wrapped);
        });
        this.importRepairCallbacks.forEach((wrapped) => {
            (previous.off as any)("dst.import.repaired", wrapped);
            (current.on as any)("dst.import.repaired", wrapped);
        });
        this.colorPickerRequestedCallbacks.forEach((wrapped) => {
            (previous.off as any)("dst.colorPicker.requested", wrapped);
            (current.on as any)("dst.colorPicker.requested", wrapped);
        });
        this.colorPickerClosedCallbacks.forEach((wrapped) => {
            (previous.off as any)("dst.colorPicker.closed", wrapped);
            (current.on as any)("dst.colorPicker.closed", wrapped);
        });
    }

    private getColorPickerCoordinator(
        session: EditorSession = this.sessionOwner.getActiveSession(),
    ): ColorPickerCoordinator {
        return session.diagram.get<ColorPickerCoordinator>(
            "domainStoryColorPickerCoordinator",
        );
    }

    private copyCustomIconPool(
        previous: EditorSession,
        candidate: EditorSession,
    ): void {
        const source = previous.diagram.get<IconDictionaryService>(
            "domainStoryIconDictionaryService",
        );
        candidate.diagram
            .get<IconDictionaryService>("domainStoryIconDictionaryService")
            .restoreCustomIcons(source.getFullDictionary());
    }

    private publishCommittedImport(
        session: EditorSession,
        removedConnections: readonly { id: string }[],
    ): void {
        try {
            session.eventBus.fire("dst.config.changed", {});
        } catch (error) {
            reportPostCommitError(error);
        }
        if (removedConnections.length > 0) {
            try {
                session.eventBus.fire("dst.import.repaired", {
                    removedConnections,
                });
            } catch (error) {
                reportPostCommitError(error);
            }
        }
    }
}
