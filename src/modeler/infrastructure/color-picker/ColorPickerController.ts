import type { ModelerPort } from "../../domain/ports";
import type {
    ColorPickerHandle,
    ColorPickerProvider,
} from "../../service/ColorPickerProvider";
import { isSupportedColor } from "../../../shared/domain/colorConverter";
import { reportPostCommitError } from "../../../shared/infrastructure/reportError";

interface ActiveProviderRequest {
    readonly requestId: string;
    readonly abortController: AbortController;
    handle?: ColorPickerHandle;
    disposed: boolean;
}

/** Owns one provider lifecycle and bridges its final result to the coordinator. */
export class ColorPickerController {
    private active?: ActiveProviderRequest;
    private destroyed = false;

    constructor(
        private readonly modelerPort: ModelerPort,
        private readonly provider: ColorPickerProvider,
    ) {
        modelerPort.onColorPickerRequested(this.onRequested);
        modelerPort.onColorPickerClosed(this.onClosed);
    }

    /** Dispose provider resources before the modeler port tears its session down. */
    destroy(): void {
        if (this.destroyed) return;
        this.destroyed = true;
        this.modelerPort.offColorPickerRequested(this.onRequested);
        this.modelerPort.offColorPickerClosed(this.onClosed);

        const request = this.active;
        if (!request) return;
        this.retire(request);
        this.cancelCoordinator(request.requestId);
    }

    private readonly onRequested = (request: {
        requestId: string;
        elementIds: readonly string[];
        color: string;
        anchor: { readonly x: number; readonly y: number };
    }): void => {
        if (this.destroyed) return;

        // Defensive for custom ports: the diagram coordinator normally closes
        // the predecessor before publishing its replacement.
        if (this.active) this.retire(this.active);

        const active: ActiveProviderRequest = {
            requestId: request.requestId,
            abortController: new AbortController(),
            disposed: false,
        };
        this.active = active;

        let handle: ColorPickerHandle;
        try {
            handle = this.provider({
                requestId: request.requestId,
                elementIds: [...request.elementIds],
                color: request.color,
                anchor: { ...request.anchor },
                signal: active.abortController.signal,
            });
            active.handle = handle;
            if (
                !handle ||
                typeof handle.dispose !== "function" ||
                !handle.result ||
                typeof handle.result.then !== "function"
            ) {
                throw new TypeError(
                    "ColorPickerProvider must return a ColorPickerHandle",
                );
            }
        } catch (error) {
            // A provider may reentrantly close this request while opening. Only
            // cancel the coordinator if this is still the current request.
            if (this.active === active) {
                this.retire(active);
                this.cancelCoordinator(active.requestId);
            } else if (active.handle) {
                this.disposeHandle(active);
            }
            reportPostCommitError(error);
            return;
        }

        // A synchronous provider can trigger request invalidation before it
        // returns its handle. It still owns that handle exactly once.
        if (this.active !== active) {
            this.disposeHandle(active);
            return;
        }

        Promise.resolve(handle.result).then(
            (result) => this.settle(active, result),
            (error) => {
                reportPostCommitError(error);
                this.settle(active, null);
            },
        );
    };

    private readonly onClosed = ({
        requestId,
    }: {
        requestId: string;
    }): void => {
        if (this.active?.requestId === requestId) {
            this.retire(this.active);
        }
    };

    private settle(
        request: ActiveProviderRequest,
        result: string | null,
    ): void {
        if (this.destroyed || this.active !== request) return;

        const shouldConfirm =
            typeof result === "string" && isSupportedColor(result);
        this.retire(request);

        try {
            if (shouldConfirm) {
                this.modelerPort.confirmPickedColor(request.requestId, result);
            } else {
                this.modelerPort.cancelColorPicker(request.requestId);
            }
        } catch (error) {
            reportPostCommitError(error);
        }
    }

    private retire(request: ActiveProviderRequest): void {
        if (this.active === request) this.active = undefined;
        if (!request.abortController.signal.aborted) {
            try {
                request.abortController.abort();
            } catch (error) {
                reportPostCommitError(error);
            }
        }
        this.disposeHandle(request);
    }

    private disposeHandle(request: ActiveProviderRequest): void {
        if (request.disposed || !request.handle) return;
        request.disposed = true;
        try {
            request.handle.dispose();
        } catch (error) {
            reportPostCommitError(error);
        }
    }

    private cancelCoordinator(requestId: string): void {
        try {
            this.modelerPort.cancelColorPicker(requestId);
        } catch (error) {
            reportPostCommitError(error);
        }
    }
}
