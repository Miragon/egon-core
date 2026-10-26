import { DomainStoryDocument } from "../../../story/domain/DomainStoryDocument";
import { ViewportData } from "../model/Viewport";
import type {
    PngExportRequest,
    PngExportResult,
    SvgExportOptions,
    SvgExportResult,
} from "../export/VisualExport";
import type {
    LabelDictionary,
    LabelRenameBatch,
} from "../../../labelDictionary/domain/LabelDictionary";
import type {
    ReplayStartOptions,
    ReplayState,
} from "../../../story/domain/replay";

/**
 * What an import had to drop to produce a loadable story. Ids only, so the
 * internal business objects do not leak across the public API.
 */
export interface ImportRepairData {
    removedConnectionIds: string[];
}

/** Internal provider request scoped to one EgonClient instance. */
export interface ColorPickerRequestData {
    requestId: string;
    elementIds: readonly string[];
    color: string;
    anchor: { readonly x: number; readonly y: number };
}

/** Identifies the provider handle that should be retired. */
export interface ColorPickerClosedData {
    requestId: string;
}

export interface ModelerPort {
    /** Import an untrusted domain story document atomically. */
    import(document: DomainStoryDocument): void;

    export(): DomainStoryDocument;

    exportSVG(options?: SvgExportOptions): Promise<SvgExportResult>;
    exportPNG(options?: PngExportRequest): Promise<PngExportResult>;

    getLabelDictionary(): LabelDictionary;
    renameLabels(changes: LabelRenameBatch): readonly string[];

    getReplayState(): ReplayState;
    startReplay(options?: ReplayStartOptions): ReplayState;
    stopReplay(): ReplayState;
    nextReplayStep(): ReplayState;
    previousReplayStep(): ReplayState;
    seekReplayStep(index: number): ReplayState;
    setReplayShowGroups(value: boolean): ReplayState;

    /** Returns a fresh object containing exactly `{ x, y, width, height }`. */
    getViewport(): ViewportData;

    setViewport(viewport: ViewportData): void;

    /**
     * Shift all contents to positive coordinates, which external tools need.
     * Undoable and fires story-changed, so call it before an export, not per edit.
     */
    alignToOrigin(): void;

    /**
     * Align to origin, then fit the story into the canvas (upstream:
     * `fitStoryToScreen`). May fire story-changed because it aligns first.
     */
    fitToScreen(): void;

    /**
     * Every `on*` is idempotent per callback; one matching `off*` removes it,
     * including a pending debounced delivery.
     */
    onStoryChanged(callback: () => void): void;
    /** Receives a fresh object containing exactly `{ x, y, width, height }`. */
    onViewportChanged(callback: (viewport: ViewportData) => void): void;

    /** Fires at most once per `import()`, and only when damage was repaired. */
    onImportRepaired(callback: (repair: ImportRepairData) => void): void;

    offStoryChanged(callback: () => void): void;
    offViewportChanged(callback: (viewport: ViewportData) => void): void;
    offImportRepaired(callback: (repair: ImportRepairData) => void): void;

    onLabelsChanged(callback: (labels: LabelDictionary) => void): void;
    offLabelsChanged(callback: (labels: LabelDictionary) => void): void;
    onReplayChanged(callback: (state: ReplayState) => void): void;
    offReplayChanged(callback: (state: ReplayState) => void): void;

    /** Synchronous; the per-client controller bridges provider lifecycle with them. */
    onColorPickerRequested(
        callback: (request: ColorPickerRequestData) => void,
    ): void;
    onColorPickerClosed(
        callback: (closed: ColorPickerClosedData) => void,
    ): void;
    offColorPickerRequested(
        callback: (request: ColorPickerRequestData) => void,
    ): void;
    offColorPickerClosed(
        callback: (closed: ColorPickerClosedData) => void,
    ): void;

    confirmPickedColor(requestId: string, color: string): boolean;
    cancelColorPicker(requestId: string): boolean;

    destroy(): void;
}
