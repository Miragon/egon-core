/** Window every adapter collapses host-facing event bursts into. */
export const DEFAULT_DEBOUNCE_MS = 100;

/**
 * A debounced function that can be disarmed again.
 *
 * `cancel()` is the reason this type exists: without it a pending timer is
 * unreachable closure state, so teardown cannot stop a callback that is already
 * in flight — the defect issue #69 removes.
 */
export interface DebouncedCallback {
    (event?: unknown): void;
    cancel(): void;
}

/**
 * Wraps `callback` so a burst of calls delivers once, `delayMs` after the last
 * one, carrying that last call's payload.
 *
 * Shared by the diagram-js adapters (each had its own private copy) so the
 * cancel-on-teardown guarantee is implemented once. Build the debouncer *once*
 * per subscription and reuse it — building a fresh one per event coalesces
 * nothing and only adds latency.
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
