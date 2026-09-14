import type {
    CancellationSignal,
    PngExportResult,
    SvgExportResult,
} from "../../domain/export/VisualExport";

export async function rasterizePng(
    source: SvgExportResult,
    scale = 1,
    cancellation?: CancellationSignal,
): Promise<PngExportResult> {
    if (!Number.isFinite(scale) || scale <= 0) {
        throw new RangeError("PNG scale must be a positive finite number");
    }
    throwIfCancelled(cancellation);

    const width = Math.max(1, Math.ceil(source.width * scale));
    const height = Math.max(1, Math.ceil(source.height * scale));
    const image = document.createElement("img");
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const url = URL.createObjectURL(
        new Blob([source.svg], { type: "image/svg+xml;charset=utf-8" }),
    );

    try {
        await loadImage(image, url, cancellation);
        throwIfCancelled(cancellation);
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Could not create a 2D canvas context");
        context.drawImage(image, 0, 0, width, height);
        const blob = await encodePng(canvas, cancellation);
        throwIfCancelled(cancellation);
        const buffer = await blob.arrayBuffer();
        throwIfCancelled(cancellation);
        return {
            bytes: new Uint8Array(buffer),
            width,
            height,
        };
    } finally {
        image.onload = null;
        image.onerror = null;
        image.src = "";
        URL.revokeObjectURL(url);
        canvas.width = 0;
        canvas.height = 0;
    }
}

function loadImage(
    image: HTMLImageElement,
    url: string,
    cancellation?: CancellationSignal,
): Promise<void> {
    return new Promise((resolve, reject) => {
        let settled = false;
        const removeCancel = cancellation?.onCancel(() => finish(abortError()));
        const finish = (error?: Error) => {
            if (settled) return;
            settled = true;
            removeCancel?.();
            if (error) reject(error);
            else resolve();
        };
        image.onload = () => finish();
        image.onerror = () =>
            finish(new Error("Could not decode exported SVG"));
        image.src = url;
        if (cancellation?.aborted) finish(abortError());
    });
}

function encodePng(
    canvas: HTMLCanvasElement,
    cancellation?: CancellationSignal,
): Promise<Blob> {
    return new Promise((resolve, reject) => {
        let settled = false;
        const removeCancel = cancellation?.onCancel(() =>
            finish(undefined, abortError()),
        );
        const finish = (blob?: Blob | null, error?: Error) => {
            if (settled) return;
            settled = true;
            removeCancel?.();
            if (error) reject(error);
            else if (blob) resolve(blob);
            else reject(new Error("Could not encode PNG"));
        };
        canvas.toBlob((blob) => finish(blob), "image/png");
        if (cancellation?.aborted) finish(undefined, abortError());
    });
}

export function abortError(): Error {
    const error = new Error("The operation was aborted");
    error.name = "AbortError";
    return error;
}

function throwIfCancelled(cancellation?: CancellationSignal): void {
    if (cancellation?.aborted) throw abortError();
}
