/** Options shared by static SVG and PNG exports. */
export interface VisualExportOptions {
    /** Extra space around rendered content. Defaults to 20 CSS pixels. */
    readonly padding?: number;
    /** CSS color painted behind the story. SVG defaults to transparent. */
    readonly background?: string;
    /** Render the document title above the story. Defaults to false. */
    readonly includeTitle?: boolean;
    /** Render the document description above the story. Defaults to false. */
    readonly includeDescription?: boolean;
}

export interface SvgExportOptions extends VisualExportOptions {
    /** Embed the EGN v4 document using the WPS-compatible DST envelope. */
    readonly embedDocument?: boolean;
}

export interface PngExportOptions extends VisualExportOptions {
    /** Output pixels per diagram CSS pixel. Defaults to 1. */
    readonly scale?: number;
    /** Cancels image decoding or canvas encoding. */
    readonly signal?: AbortSignal;
}

export interface SvgExportResult {
    readonly svg: string;
    readonly width: number;
    readonly height: number;
}

export interface PngExportResult {
    readonly bytes: Uint8Array;
    readonly width: number;
    readonly height: number;
}

/** Framework-free cancellation seam used by the modeler port. */
export interface CancellationSignal {
    readonly aborted: boolean;
    onCancel(callback: () => void): () => void;
}

/** Port-facing request; public AbortSignal has already been adapted. */
export interface PngExportRequest extends VisualExportOptions {
    readonly scale?: number;
    readonly cancellation?: CancellationSignal;
}
