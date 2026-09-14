import { afterEach, describe, expect, it, vi } from "vitest";

import type {
    ColorPickerClosedData,
    ColorPickerRequestData,
    ModelerPort,
} from "../../../domain/ports";
import type {
    ColorPickerHandle,
    ColorPickerProvider,
} from "../../../service/ColorPickerProvider";
import { ColorPickerController } from "../ColorPickerController";

function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (error: unknown) => void;
    const promise = new Promise<T>((done, fail) => {
        resolve = done;
        reject = fail;
    });
    return { promise, resolve, reject };
}

function setup(provider: ColorPickerProvider) {
    const requested = new Set<(request: ColorPickerRequestData) => void>();
    const closed = new Set<(event: ColorPickerClosedData) => void>();
    const port = {
        onColorPickerRequested: (callback: any) => requested.add(callback),
        offColorPickerRequested: (callback: any) => requested.delete(callback),
        onColorPickerClosed: (callback: any) => closed.add(callback),
        offColorPickerClosed: (callback: any) => closed.delete(callback),
        confirmPickedColor: vi.fn(() => true),
        cancelColorPicker: vi.fn(() => true),
    } as unknown as ModelerPort;
    const controller = new ColorPickerController(port, provider);
    const emitRequest = (requestId = "request-1") => {
        requested.forEach((callback) =>
            callback({
                requestId,
                elementIds: ["Actor_1"],
                color: "#000000",
                anchor: { x: 20, y: 30 },
            }),
        );
    };
    const emitClosed = (requestId = "request-1") => {
        closed.forEach((callback) => callback({ requestId }));
    };
    return { controller, port, emitRequest, emitClosed };
}

async function settle(): Promise<void> {
    await Promise.resolve();
    await Promise.resolve();
}

describe("ColorPickerController", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it.each([
        "#abc",
        "#abcd",
        "#aabbcc",
        "#aabbcc80",
        "rgb(1, 2, 255)",
        "rgba(1, 2, 3, .5)",
    ])("confirms supported provider result %s", async (color) => {
        const choice = deferred<string | null>();
        const dispose = vi.fn();
        const subject = setup(() => ({ result: choice.promise, dispose }));
        subject.emitRequest();

        choice.resolve(color);
        await settle();

        expect(subject.port.confirmPickedColor).toHaveBeenCalledWith(
            "request-1",
            color,
        );
        expect(subject.port.cancelColorPicker).not.toHaveBeenCalled();
        expect(dispose).toHaveBeenCalledTimes(1);
    });

    it.each([
        null,
        "red",
        " #fff",
        "#12345",
        "rgb(256, 0, 0)",
        "rgba(1, 2, 3, 2)",
    ])("cancels unsupported provider result %s", async (color) => {
        const choice = deferred<string | null>();
        const subject = setup(() => ({
            result: choice.promise,
            dispose: vi.fn(),
        }));
        subject.emitRequest();

        choice.resolve(color);
        await settle();

        expect(subject.port.confirmPickedColor).not.toHaveBeenCalled();
        expect(subject.port.cancelColorPicker).toHaveBeenCalledWith(
            "request-1",
        );
    });

    it("aborts, disposes exactly once, and ignores a late result after closure", async () => {
        const choice = deferred<string | null>();
        const dispose = vi.fn();
        let signal: AbortSignal | undefined;
        const subject = setup((request) => {
            signal = request.signal;
            return { result: choice.promise, dispose };
        });
        subject.emitRequest();

        subject.emitClosed();
        subject.emitClosed();
        choice.resolve("#ff0000");
        await settle();

        expect(signal?.aborted).toBe(true);
        expect(dispose).toHaveBeenCalledTimes(1);
        expect(subject.port.confirmPickedColor).not.toHaveBeenCalled();
        expect(subject.port.cancelColorPicker).not.toHaveBeenCalled();
    });

    it("retires a provider handle before opening a replacement request", () => {
        const calls: string[] = [];
        const subject = setup((request) => ({
            result: new Promise<string | null>(() => undefined),
            dispose: () => calls.push(`dispose:${request.requestId}`),
        }));

        subject.emitRequest("request-1");
        subject.emitRequest("request-2");

        expect(calls).toEqual(["dispose:request-1"]);
    });

    it("cleans up a handle returned after reentrant closure", () => {
        const dispose = vi.fn();
        const subject = setup(() => {
            subject.emitClosed();
            return {
                result: new Promise<string | null>(() => undefined),
                dispose,
            };
        });

        subject.emitRequest();
        expect(dispose).toHaveBeenCalledTimes(1);
    });

    it("cancels and reports synchronous provider failures", () => {
        const reportError = vi.fn();
        vi.stubGlobal("reportError", reportError);
        const failure = new Error("provider failed");
        const subject = setup(() => {
            throw failure;
        });

        subject.emitRequest();

        expect(subject.port.cancelColorPicker).toHaveBeenCalledWith(
            "request-1",
        );
        expect(reportError).toHaveBeenCalledWith(failure);
    });

    it("cancels and reports rejected results while containing disposal errors", async () => {
        const reportError = vi.fn();
        vi.stubGlobal("reportError", reportError);
        const choice = deferred<string | null>();
        const rejection = new Error("result failed");
        const cleanup = new Error("cleanup failed");
        const handle: ColorPickerHandle = {
            result: choice.promise,
            dispose: () => {
                throw cleanup;
            },
        };
        const subject = setup(() => handle);
        subject.emitRequest();

        choice.reject(rejection);
        await settle();

        expect(subject.port.cancelColorPicker).toHaveBeenCalledWith(
            "request-1",
        );
        expect(reportError).toHaveBeenCalledWith(rejection);
        expect(reportError).toHaveBeenCalledWith(cleanup);
    });

    it("destroys provider resources before cancelling and ignores late results", async () => {
        const calls: string[] = [];
        const choice = deferred<string | null>();
        const subject = setup(() => ({
            result: choice.promise,
            dispose: () => calls.push("dispose"),
        }));
        (subject.port.cancelColorPicker as any).mockImplementation(() => {
            calls.push("cancel");
            return true;
        });
        subject.emitRequest();

        subject.controller.destroy();
        choice.resolve("#ff0000");
        await settle();

        expect(calls).toEqual(["dispose", "cancel"]);
        expect(subject.port.confirmPickedColor).not.toHaveBeenCalled();
    });
});
