/** Window every adapter collapses host-facing event bursts into. */
export const DEFAULT_DEBOUNCE_MS = 100;

/** `cancel()` lets teardown stop a pending delivery. */
export interface DebouncedCallback {
    (event?: unknown): void;
    cancel(): void;
}

/**
 * Delivers a burst once, `delayMs` after the last call, with that call's
 * payload. Build it once per subscription: a fresh debouncer per event
 * coalesces nothing.
 */
export function createDebouncedCallback(
    callback: (event?: unknown) => void,
    delayMs: number = DEFAULT_DEBOUNCE_MS,
): DebouncedCallback {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const debounced = (event?: unknown): void => {
        if (timeoutId) clearTimeout(timeoutId);
        // Nulled from inside the timer body so a cancel() after delivery is a
        // no-op rather than clearing an already-fired handle.
        timeoutId = setTimeout(() => {
            timeoutId = null;
            callback(event);
        }, delayMs);
    };

    debounced.cancel = (): void => {
        if (timeoutId) clearTimeout(timeoutId);
        timeoutId = null;
    };

    return debounced;
}
