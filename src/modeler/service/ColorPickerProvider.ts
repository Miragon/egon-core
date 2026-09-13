/** Browser-viewport coordinates beside the color action that opened a picker. */
export interface ColorPickerAnchor {
    readonly x: number;
    readonly y: number;
}

/** Immutable data handed to a client-owned color-picker provider. */
export interface ColorPickerRequest {
    readonly requestId: string;
    readonly elementIds: readonly string[];
    readonly color: string;
    readonly anchor: ColorPickerAnchor;
    readonly signal: AbortSignal;
}

/** Resources and eventual user decision for one color-picker request. */
export interface ColorPickerHandle {
    /** A supported color applies it; `null` cancels without a command. */
    readonly result: Promise<string | null>;
    /** Release all UI, listeners, and other provider-owned resources. */
    dispose(): void;
}

/** Opens one picker synchronously and returns its lifecycle handle. */
export type ColorPickerProvider = (
    request: ColorPickerRequest,
) => ColorPickerHandle;
