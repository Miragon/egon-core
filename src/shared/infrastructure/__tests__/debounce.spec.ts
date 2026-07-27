import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_DEBOUNCE_MS, createDebouncedCallback } from "../debounce";

/**
 * Locks the two properties the adapters rely on and issue #69 was filed over:
 * a burst really coalesces (the old per-event debouncer did not), and a pending
 * delivery can be cancelled (the old closure-private timer could not).
 *
 * Unit tier per ADR 0014 — the only tier that may freeze the clock.
 */
describe("createDebouncedCallback", () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("delivers once after the window, and not before", () => {
        const callback = vi.fn();
        const debounced = createDebouncedCallback(callback);

        debounced();
        vi.advanceTimersByTime(DEFAULT_DEBOUNCE_MS - 1);
        expect(callback).not.toHaveBeenCalled();

        vi.advanceTimersByTime(1);
        expect(callback).toHaveBeenCalledTimes(1);
    });

    it("coalesces a burst into a single delivery", () => {
        const callback = vi.fn();
        const debounced = createDebouncedCallback(callback);

        for (let index = 0; index < 5; index++) {
            debounced();
        }
        vi.advanceTimersByTime(DEFAULT_DEBOUNCE_MS);

        expect(callback).toHaveBeenCalledTimes(1);
    });

    it("delivers the payload of the last call in the burst", () => {
        const callback = vi.fn();
        const debounced = createDebouncedCallback(callback);

        debounced("first");
        debounced("last");
        vi.advanceTimersByTime(DEFAULT_DEBOUNCE_MS);

        expect(callback).toHaveBeenCalledWith("last");
    });

    it("restarts the window on every call (trailing, not throttling)", () => {
        const callback = vi.fn();
        const debounced = createDebouncedCallback(callback);

        debounced();
        vi.advanceTimersByTime(DEFAULT_DEBOUNCE_MS - 10);
        debounced();
        vi.advanceTimersByTime(DEFAULT_DEBOUNCE_MS - 10);

        // A throttle would already have fired at the original deadline.
        expect(callback).not.toHaveBeenCalled();

        vi.advanceTimersByTime(10);
        expect(callback).toHaveBeenCalledTimes(1);
    });

    it("honours a custom delay", () => {
        const callback = vi.fn();
        const debounced = createDebouncedCallback(callback, 25);

        debounced();
        vi.advanceTimersByTime(25);

        expect(callback).toHaveBeenCalledTimes(1);
    });

    it("delivers nothing when cancelled inside the window", () => {
        const callback = vi.fn();
        const debounced = createDebouncedCallback(callback);

        debounced();
        debounced.cancel();
        vi.advanceTimersByTime(DEFAULT_DEBOUNCE_MS * 10);

        expect(callback).not.toHaveBeenCalled();
    });

    it("is safe to cancel with nothing pending and after a delivery", () => {
        const callback = vi.fn();
        const debounced = createDebouncedCallback(callback);

        expect(() => debounced.cancel()).not.toThrow();

        debounced();
        vi.advanceTimersByTime(DEFAULT_DEBOUNCE_MS);
        expect(() => debounced.cancel()).not.toThrow();

        // The cancel must not retroactively undo the delivery.
        expect(callback).toHaveBeenCalledTimes(1);
    });

    it("keeps two debouncers on independent timers", () => {
        // The inverse of the fresh-debouncer-per-event bug: separate debouncers
        // must not clear each other's timer, and must not share a window.
        const first = vi.fn();
        const second = vi.fn();
        const debouncedFirst = createDebouncedCallback(first);
        const debouncedSecond = createDebouncedCallback(second);

        debouncedFirst();
        debouncedSecond();
        debouncedFirst.cancel();
        vi.advanceTimersByTime(DEFAULT_DEBOUNCE_MS);

        expect(first).not.toHaveBeenCalled();
        expect(second).toHaveBeenCalledTimes(1);
    });
});
