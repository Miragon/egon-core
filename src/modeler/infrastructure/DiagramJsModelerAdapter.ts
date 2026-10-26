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
import { LabelDictionaryService } from "../../labelDictionary/service";
import type {
    LabelDictionary,
    LabelRenameBatch,
} from "../../labelDictionary/domain/LabelDictionary";
import type {
    CancellationSignal,
    PngExportRequest,
    PngExportResult,
    SvgExportOptions,
    SvgExportResult,
} from "../domain/export/VisualExport";
import type {
    ReplayStartOptions,
    ReplayState,
} from "../../story/domain/replay";
import { exportStaticSvg } from "./export/StaticSvgExporter";
import { rasterizePng } from "./export/PngRasterizer";
import { ReplayController } from "./replay/ReplayController";

/** Project diagram-js' richer viewbox onto the stable public port shape. */
function projectViewport(viewbox: ViewportData): ViewportData {
    return {
        x: viewbox.x,
        y: viewbox.y,
        width: viewbox.width,
        height: viewbox.height,
    };
}

export class DiagramJsModelerAdapter implements ModelerPort {
    private readonly sessionOwner: EditorSessionOwner;
    private importInProgress = false;
    private destroyed = false;
    private replayController: ReplayController;
    private readonly replayCallbacks = new Set<(state: ReplayState) => void>();
    private readonly pendingExports = new Set<ExportCancellation>();

    // Separate maps: one zero-arg callback may subscribe to both events, and a
    // shared map would lose the first handle, leaving a timer alive past destroy().
    private readonly storyCallbacks: Map<() => void, DebouncedCallback> =
        new Map();
    private readonly viewportCallbacks: Map<
        (viewport: ViewportData) => void,
        DebouncedCallback
    > = new Map();
    // Undebounced: fires at most once per import, and must not arrive after the
    // import returns.
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
    private readonly labelCallbacks = new Map<
        (labels: LabelDictionary) => void,
        { wrapped: (event: any) => void; last: string }
    >();

    constructor(
        container: HTMLElement,
        width: string,
        height: string,
        additionalModules: ModuleDeclaration[] = [],
        textRenderer?: DomainStoryTextRendererConfig,
        colorPickerEnabled = true,
    ) {
        this.sessionOwner = new EditorSessionOwner(
            container,
            width,
            height,
            additionalModules,
            textRenderer,
            colorPickerEnabled,
        );
        this.replayController = this.createReplayController(
            this.sessionOwner.getActiveDiagram(),
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
            this.abortPendingExports();
            // Only a successful promotion expires the open request, while its
            // old-bus callbacks can still dismiss the host UI.
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
            this.replaceReplayController(candidate.diagram);

            // Re-fire the public notifications now that listeners have moved.
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

    async exportSVG(options: SvgExportOptions = {}): Promise<SvgExportResult> {
        const { document, session } = this.captureExportSession();
        try {
            return exportStaticSvg(session.canvas, document, options);
        } finally {
            this.sessionOwner.dispose(session);
        }
    }

    exportPNG(options: PngExportRequest = {}): Promise<PngExportResult> {
        const cancellation = new ExportCancellation(options.cancellation);
        if (cancellation.aborted) {
            cancellation.dispose();
            const error = new Error("The operation was aborted");
            error.name = "AbortError";
            return Promise.reject(error);
        }

        // Everything through SVG preparation is synchronous: later edits can
        // only affect the live session, never this captured candidate.
        let capture: ReturnType<
            DiagramJsModelerAdapter["captureExportSession"]
        >;
        try {
            capture = this.captureExportSession();
        } catch (error) {
            cancellation.dispose();
            return Promise.reject(error);
        }
        const { document, session } = capture;
        this.pendingExports.add(cancellation);
        let svg: SvgExportResult;
        try {
            svg = exportStaticSvg(session.canvas, document, {
                padding: options.padding,
                background: options.background ?? "white",
                includeTitle: options.includeTitle,
                includeDescription: options.includeDescription,
                embedDocument: false,
            });
        } catch (error) {
            this.pendingExports.delete(cancellation);
            cancellation.dispose();
            this.sessionOwner.dispose(session);
            return Promise.reject(error);
        }

        return rasterizePng(svg, options.scale, cancellation).finally(() => {
            this.pendingExports.delete(cancellation);
            cancellation.dispose();
            this.sessionOwner.dispose(session);
        });
    }

    getLabelDictionary(): LabelDictionary {
        const dictionary = this.getDiagram()
            .get<LabelDictionaryService>("domainStoryLabelDictionaryService")
            .getDictionary();
        return detachLabels(dictionary);
    }

    renameLabels(changes: LabelRenameBatch): readonly string[] {
        return this.getDiagram()
            .get<LabelDictionaryService>("domainStoryLabelDictionaryService")
            .renameLabels(changes);
    }

    getReplayState(): ReplayState {
        return this.replayController.getState();
    }

    startReplay(options?: ReplayStartOptions): ReplayState {
        return this.replayController.start(options);
    }

    stopReplay(): ReplayState {
        return this.replayController.stop();
    }

    nextReplayStep(): ReplayState {
        return this.replayController.next();
    }

    previousReplayStep(): ReplayState {
        return this.replayController.previous();
    }

    seekReplayStep(index: number): ReplayState {
        return this.replayController.seek(index);
    }

    setReplayShowGroups(value: boolean): ReplayState {
        return this.replayController.setShowGroups(value);
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
        // upstream: fitStoryToScreen calls canvas._fitViewport({ x: 0, y: 0 });
        // zoom("fit-viewport", center) is its public equivalent.
        this.getCanvas().zoom("fit-viewport", { x: 0, y: 0 });
    }

    onStoryChanged(callback: () => void): void {
        if (this.storyCallbacks.has(callback)) {
            return;
        }
        // One debouncer per subscription; one per event would never coalesce.
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
        // Only ids cross the port, never the business objects.
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
            // Cancel too, or an armed timer still calls the host after off().
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

    onLabelsChanged(callback: (labels: LabelDictionary) => void): void {
        if (this.labelCallbacks.has(callback)) return;

        const registration: {
            last: string;
            wrapped: (event: any) => void;
        } = {
            last: JSON.stringify(this.getLabelDictionary()),
            wrapped: () => {},
        };
        registration.wrapped = (event: any) => {
            const labels = this.getLabelDictionary();
            const next = JSON.stringify(labels);
            const force = event?.type === "dst.import.committed";
            if (!force && next === registration.last) return;
            registration.last = next;
            try {
                callback(labels);
            } catch (error) {
                reportPostCommitError(error);
            }
        };
        this.labelCallbacks.set(callback, registration);
        (this.getEventBus().on as any)(
            ["commandStack.changed", "dst.import.committed"],
            registration.wrapped,
        );
    }

    offLabelsChanged(callback: (labels: LabelDictionary) => void): void {
        const registration = this.labelCallbacks.get(callback);
        if (!registration) return;
        (this.getEventBus().off as any)(
            ["commandStack.changed", "dst.import.committed"],
            registration.wrapped,
        );
        this.labelCallbacks.delete(callback);
    }

    onReplayChanged(callback: (state: ReplayState) => void): void {
        this.replayCallbacks.add(callback);
    }

    offReplayChanged(callback: (state: ReplayState) => void): void {
        this.replayCallbacks.delete(callback);
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
                    anchor: {
                        x: Number(event.anchor?.x ?? 0),
                        y: Number(event.anchor?.y ?? 0),
                    },
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
     * Unsubscribes before destroying the diagram, so `canvas.destroy` on the
     * still-live bus cannot reach a host handler.
     */
    destroy(): void {
        if (this.destroyed) return;
        this.destroyed = true;
        this.abortPendingExports();
        this.replayController.destroy();
        this.unsubscribeAll();
        this.sessionOwner.destroy();
    }

    getDiagram(): Diagram {
        return this.sessionOwner.getActiveDiagram();
    }

    getSessionOwner(): EditorSessionOwner {
        return this.sessionOwner;
    }

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

        this.labelCallbacks.forEach(({ wrapped }) => {
            (this.getEventBus().off as any)(
                ["commandStack.changed", "dst.import.committed"],
                wrapped,
            );
        });
        this.labelCallbacks.clear();
        this.replayCallbacks.clear();
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
        this.labelCallbacks.forEach((registration) => {
            (previous.off as any)(
                ["commandStack.changed", "dst.import.committed"],
                registration.wrapped,
            );
            registration.last = JSON.stringify(this.getLabelDictionary());
            (current.on as any)(
                ["commandStack.changed", "dst.import.committed"],
                registration.wrapped,
            );
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
        try {
            session.eventBus.fire("dst.import.committed", {});
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

    private captureExportSession(): {
        document: DomainStoryDocument;
        session: EditorSession;
    } {
        if (this.destroyed) throw new Error("EgonClient has been destroyed");
        const document = this.export();
        const active = this.sessionOwner.getActiveSession();
        const session = this.sessionOwner.createCandidate();
        try {
            this.copyCustomIconPool(active, session);
            const importService = session.diagram.get<DomainStoryImportService>(
                "domainStoryImportService",
            );
            importService.materialize(importService.prepare(document));
            return { document, session };
        } catch (error) {
            this.sessionOwner.dispose(session);
            throw error;
        }
    }

    private abortPendingExports(): void {
        this.pendingExports.forEach((cancellation) => cancellation.abort());
    }

    private createReplayController(
        diagram: Diagram,
        showGroups = false,
    ): ReplayController {
        return new ReplayController(
            diagram,
            (state) => this.publishReplayChanged(state),
            showGroups,
        );
    }

    private replaceReplayController(diagram: Diagram): void {
        const previousState = this.replayController.getState();
        this.replayController.destroy();
        this.replayController = this.createReplayController(
            diagram,
            previousState.showGroups,
        );
        if (previousState.active) {
            this.publishReplayChanged(this.replayController.getState());
        }
    }

    private publishReplayChanged(state: ReplayState): void {
        this.replayCallbacks.forEach((callback) => {
            try {
                callback({ ...state });
            } catch (error) {
                reportPostCommitError(error);
            }
        });
    }
}

function detachLabels(labels: LabelDictionary): LabelDictionary {
    return {
        activities: labels.activities.map((entry) => ({ ...entry })),
        workObjects: labels.workObjects.map((entry) => ({ ...entry })),
    };
}

class ExportCancellation implements CancellationSignal {
    private cancelled = false;
    private readonly callbacks = new Set<() => void>();
    private readonly removeExternal?: () => void;

    constructor(external?: CancellationSignal) {
        if (external) {
            this.removeExternal = external.onCancel(() => this.abort());
            if (external.aborted) this.abort();
        }
    }

    get aborted(): boolean {
        return this.cancelled;
    }

    onCancel(callback: () => void): () => void {
        if (this.cancelled) callback();
        else this.callbacks.add(callback);
        return () => this.callbacks.delete(callback);
    }

    abort(): void {
        if (this.cancelled) return;
        this.cancelled = true;
        [...this.callbacks].forEach((callback) => callback());
        this.callbacks.clear();
    }

    dispose(): void {
        this.removeExternal?.();
        this.callbacks.clear();
    }
}
