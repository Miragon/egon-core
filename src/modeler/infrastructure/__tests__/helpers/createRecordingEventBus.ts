import { vi } from "vitest";

/**
 * A diagram-js `eventBus` stub that really registers, removes and dispatches
 * listeners.
 *
 * Both adapter specs need this rather than bare `vi.fn()`s: the properties #69
 * is about — a burst coalescing into one callback, `destroy()` disarming an
 * in-flight timer, `off()` matching by function identity — can only be observed
 * by firing events and counting what comes out the other side. Dispatch is
 * synchronous, so only the adapters' own debounce delays a callback.
 */
export function createRecordingEventBus() {
    const listeners = new Map<string, ((...args: unknown[]) => void)[]>();

    return {
        on: vi.fn((event: string, callback: (...args: unknown[]) => void) => {
            if (!listeners.has(event)) {
                listeners.set(event, []);
            }
            listeners.get(event)!.push(callback);
        }),
        off: vi.fn((event: string, callback: (...args: unknown[]) => void) => {
            const eventListeners = listeners.get(event);
            if (eventListeners) {
                const index = eventListeners.indexOf(callback);
                if (index > -1) {
                    eventListeners.splice(index, 1);
                }
            }
        }),
        fire: vi.fn((event: string, data?: unknown) => {
            // Copied before iterating: a listener may unsubscribe itself.
            const eventListeners = listeners.get(event);
            if (eventListeners) {
                [...eventListeners].forEach((callback) => callback(data));
            }
        }),
        /** Total live subscriptions — proves teardown left nothing attached. */
        listenerCount: (): number =>
            [...listeners.values()].reduce(
                (total, eventListeners) => total + eventListeners.length,
                0,
            ),
    };
}
