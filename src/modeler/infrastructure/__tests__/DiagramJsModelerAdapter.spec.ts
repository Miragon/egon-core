import {
    describe,
    it,
    expect,
    beforeEach,
    afterEach,
    vi,
    type Mock,
} from "vitest";

import { createRecordingEventBus } from "./helpers/createRecordingEventBus";

function createMockDiagramServices() {
    const mockEventBus = createRecordingEventBus();

    const mockCanvas = {
        viewbox: vi
            .fn()
            .mockReturnValue({ x: 0, y: 0, width: 100, height: 100 }),
        // `isBackground` keys off the implicit root's id prefix.
        getRootElement: vi
            .fn()
            .mockReturnValue({ id: "__implicitroot_0", children: [] }),
        zoom: vi.fn(),
    };

    const mockAlignToOrigin = {
        align: vi.fn(),
    };
    const mockColorPickerCoordinator = {
        preview: vi.fn(),
        confirm: vi.fn(),
        cancel: vi.fn(),
        cancelActive: vi.fn(),
    };

    const get = vi.fn((serviceName: string) => {
        switch (serviceName) {
            case "eventBus":
                return mockEventBus;
            case "canvas":
                return mockCanvas;
            case "alignToOrigin":
                return mockAlignToOrigin;
            case "domainStoryColorPickerCoordinator":
                return mockColorPickerCoordinator;
            default:
                return {};
        }
    });

    return {
        get,
        destroy: vi.fn(),
        mockEventBus,
        mockCanvas,
        mockAlignToOrigin,
        mockColorPickerCoordinator,
    };
}

let services: ReturnType<typeof createMockDiagramServices>;

// Captured so cases can pin DI config keys the compiler cannot check.
let diagramOptions: Record<string, any>[] = [];
let canvasContainers: HTMLElement[] = [];

// jsdom has no SVG canvas, so `new Diagram(...)` returns a stub injector.
vi.mock("diagram-js", () => ({
    default: vi.fn(function (options: Record<string, any>) {
        diagramOptions.push(options);
        const canvasContainer = document.createElement("div");
        canvasContainer.className = "djs-container";
        options["canvas"].container.appendChild(canvasContainer);
        canvasContainers.push(canvasContainer);
        return {
            get: (name: string) =>
                name === "canvas"
                    ? {
                          ...services.mockCanvas,
                          getContainer: () => canvasContainer,
                      }
                    : services.get(name),
            destroy: () => services.destroy(),
        };
    }),
}));

import { DiagramJsModelerAdapter } from "../DiagramJsModelerAdapter";
import { DEFAULT_DEBOUNCE_MS } from "../../../shared/infrastructure/debounce";

const ICON_STYLE_SELECTOR = "[data-egon-icons-css]";

describe("DiagramJsModelerAdapter", () => {
    let adapter: DiagramJsModelerAdapter;
    let container: HTMLElement;

    beforeEach(() => {
        services = createMockDiagramServices();
        diagramOptions = [];
        canvasContainers = [];
        container = document.createElement("div");
        adapter = new DiagramJsModelerAdapter(container, "100%", "100%");
    });

    afterEach(() => {
        vi.clearAllMocks();
        vi.useRealTimers();
    });

    describe("viewport projection", () => {
        it("returns a fresh four-field viewport without leaking the canvas viewbox", () => {
            const internalViewbox = {
                x: 10,
                y: 20,
                width: 300,
                height: 200,
                scale: 2,
                inner: { x: 1, y: 2, width: 3, height: 4 },
                outer: { x: 5, y: 6, width: 7, height: 8 },
            };
            services.mockCanvas.viewbox.mockReturnValue(internalViewbox);

            const viewport = adapter.getViewport();

            expect(JSON.parse(JSON.stringify(viewport))).toEqual({
                x: 10,
                y: 20,
                width: 300,
                height: 200,
            });
            expect(viewport).not.toBe(internalViewbox);

            viewport.x = 999;
            expect(internalViewbox.x).toBe(10);
        });
    });

    describe("alignToOrigin", () => {
        it("should call align() on the alignToOrigin service", () => {
            adapter.alignToOrigin();

            expect(services.mockAlignToOrigin.align).toHaveBeenCalledTimes(1);
        });
    });

    describe("fitToScreen", () => {
        it("should align first, then fit the viewport to the origin", () => {
            adapter.fitToScreen();

            expect(services.mockAlignToOrigin.align).toHaveBeenCalledTimes(1);
            expect(services.mockCanvas.zoom).toHaveBeenCalledWith(
                "fit-viewport",
                { x: 0, y: 0 },
            );
        });

        it("should align before fitting so contents are positive when fit", () => {
            adapter.fitToScreen();

            const alignOrder = (services.mockAlignToOrigin.align as Mock).mock
                .invocationCallOrder[0];
            const zoomOrder = (services.mockCanvas.zoom as Mock).mock
                .invocationCallOrder[0];
            expect(alignOrder).toBeLessThan(zoomOrder);
        });
    });

    /** Fake timers are allowed here (ADR TST-2): no real canvas to stall. */
    describe("event debouncing", () => {
        beforeEach(() => {
            vi.useFakeTimers();
        });

        it("collapses a burst of commandStack.changed into one callback", () => {
            const storyChanged = vi.fn();
            adapter.onStoryChanged(storyChanged);

            for (let index = 0; index < 5; index++) {
                services.mockEventBus.fire("commandStack.changed");
            }
            vi.advanceTimersByTime(DEFAULT_DEBOUNCE_MS);

            expect(storyChanged).toHaveBeenCalledTimes(1);
        });

        it("collapses a viewbox burst and projects the last viewbox", () => {
            const viewportChanged = vi.fn();
            adapter.onViewportChanged(viewportChanged);

            services.mockEventBus.fire("canvas.viewbox.changed", {
                viewbox: {
                    x: 1,
                    y: 1,
                    width: 10,
                    height: 10,
                    scale: 1,
                    inner: {},
                    outer: {},
                },
            });
            const last = {
                x: 9,
                y: 9,
                width: 90,
                height: 90,
                scale: 2,
                inner: { x: 1 },
                outer: { x: 2 },
            };
            services.mockEventBus.fire("canvas.viewbox.changed", {
                viewbox: last,
            });
            vi.advanceTimersByTime(DEFAULT_DEBOUNCE_MS);

            expect(viewportChanged).toHaveBeenCalledTimes(1);
            const delivered = viewportChanged.mock.calls[0]![0];
            expect(JSON.parse(JSON.stringify(delivered))).toEqual({
                x: 9,
                y: 9,
                width: 90,
                height: 90,
            });
            expect(delivered).not.toBe(last);

            delivered.x = 999;
            expect(last.x).toBe(9);
        });

        it("delivers nothing after off(), even mid-window", () => {
            const storyChanged = vi.fn();
            adapter.onStoryChanged(storyChanged);

            services.mockEventBus.fire("commandStack.changed");
            adapter.offStoryChanged(storyChanged);
            vi.advanceTimersByTime(DEFAULT_DEBOUNCE_MS);

            expect(storyChanged).not.toHaveBeenCalled();
        });
    });

    /** Undebounced: must arrive before `import()` returns (ADR DOC-2). */
    describe("import repair signalling", () => {
        const REPAIRED = {
            removedConnections: [
                { id: "connection_1" },
                { id: "connection_2" },
            ],
        };

        it("maps the dropped business objects down to their ids", () => {
            const importRepaired = vi.fn();
            adapter.onImportRepaired(importRepaired);

            services.mockEventBus.fire("dst.import.repaired", REPAIRED);

            expect(importRepaired).toHaveBeenCalledWith({
                removedConnectionIds: ["connection_1", "connection_2"],
            });
        });

        it("delivers synchronously, without waiting out a debounce window", () => {
            vi.useFakeTimers();
            const importRepaired = vi.fn();
            adapter.onImportRepaired(importRepaired);

            services.mockEventBus.fire("dst.import.repaired", REPAIRED);

            expect(importRepaired).toHaveBeenCalledTimes(1);
        });

        it("delivers nothing after off()", () => {
            const importRepaired = vi.fn();
            adapter.onImportRepaired(importRepaired);
            adapter.offImportRepaired(importRepaired);

            services.mockEventBus.fire("dst.import.repaired", REPAIRED);

            expect(importRepaired).not.toHaveBeenCalled();
        });
    });

    describe("color picker bridge", () => {
        it("projects requested and closed events synchronously", () => {
            const requested = vi.fn();
            const closed = vi.fn();
            adapter.onColorPickerRequested(requested);
            adapter.onColorPickerClosed(closed);

            services.mockEventBus.fire("dst.colorPicker.requested", {
                requestId: "request-1",
                elementIds: ["Actor_1"],
                color: "#000000",
            });
            services.mockEventBus.fire("dst.colorPicker.closed", {
                requestId: "request-1",
            });

            expect(requested).toHaveBeenCalledWith({
                requestId: "request-1",
                elementIds: ["Actor_1"],
                color: "#000000",
                anchor: { x: 0, y: 0 },
            });
            expect(closed).toHaveBeenCalledWith({ requestId: "request-1" });
        });

        it("keeps subscriptions idempotent and independently removable", () => {
            const requested = vi.fn();
            adapter.onColorPickerRequested(requested);
            adapter.onColorPickerRequested(requested);
            expect(services.mockEventBus.listenerCount()).toBe(1);

            adapter.offColorPickerRequested(requested);
            services.mockEventBus.fire("dst.colorPicker.requested", {
                requestId: "request-1",
                elementIds: [],
                color: "#000000",
            });
            expect(requested).not.toHaveBeenCalled();
        });

        it("routes confirmation and cancellation to the coordinator", () => {
            services.mockColorPickerCoordinator.confirm.mockReturnValue(true);
            services.mockColorPickerCoordinator.cancel.mockReturnValue(true);

            expect(adapter.confirmPickedColor("request-1", "#222222")).toBe(
                true,
            );
            expect(adapter.cancelColorPicker("request-1")).toBe(true);
        });

        it("returns false without reaching the coordinator after destroy", () => {
            adapter.destroy();

            expect(adapter.confirmPickedColor("request-1", "#222222")).toBe(
                false,
            );
            expect(adapter.cancelColorPicker("request-1")).toBe(false);
            expect(
                services.mockColorPickerCoordinator.confirm,
            ).not.toHaveBeenCalled();
        });
    });

    describe("destroy", () => {
        beforeEach(() => {
            vi.useFakeTimers();
        });

        it("cancels story and viewport callbacks already in flight", () => {
            const storyChanged = vi.fn();
            const viewportChanged = vi.fn();
            adapter.onStoryChanged(storyChanged);
            adapter.onViewportChanged(viewportChanged);

            services.mockEventBus.fire("commandStack.changed");
            services.mockEventBus.fire("canvas.viewbox.changed", {
                viewbox: { x: 0, y: 0, width: 1, height: 1 },
            });
            adapter.destroy();
            vi.advanceTimersByTime(DEFAULT_DEBOUNCE_MS * 10);

            expect(storyChanged).not.toHaveBeenCalled();
            expect(viewportChanged).not.toHaveBeenCalled();
        });

        it("unsubscribes with the very handle it subscribed", () => {
            adapter.onStoryChanged(vi.fn());
            adapter.onViewportChanged(vi.fn());
            adapter.onImportRepaired(vi.fn());
            const subscribed = services.mockEventBus.on.mock.calls;

            adapter.destroy();

            // Identity matters: `off` with a different function is a no-op.
            expect(services.mockEventBus.off.mock.calls).toEqual(subscribed);
            expect(services.mockEventBus.listenerCount()).toBe(0);
        });

        it("removes the style node it injected, leaving the container empty", () => {
            expect(container.querySelector(ICON_STYLE_SELECTOR)).not.toBeNull();

            adapter.destroy();

            expect(container.children.length).toBe(0);
        });

        it("destroys the diagram", () => {
            adapter.destroy();

            expect(services.destroy).toHaveBeenCalledTimes(1);
        });
    });

    describe("callback registry", () => {
        beforeEach(() => {
            vi.useFakeTimers();
        });

        it("makes duplicate story subscriptions idempotent through off, resubscribe, and destroy", () => {
            const storyChanged = vi.fn();
            adapter.onStoryChanged(storyChanged);
            services.mockEventBus.fire("commandStack.changed");

            // Re-registering while pending must keep the original timer.
            adapter.onStoryChanged(storyChanged);
            expect(services.mockEventBus.listenerCount()).toBe(1);
            vi.advanceTimersByTime(DEFAULT_DEBOUNCE_MS);
            expect(storyChanged).toHaveBeenCalledTimes(1);

            services.mockEventBus.fire("commandStack.changed");
            adapter.offStoryChanged(storyChanged);
            vi.advanceTimersByTime(DEFAULT_DEBOUNCE_MS);
            expect(storyChanged).toHaveBeenCalledTimes(1);
            expect(services.mockEventBus.listenerCount()).toBe(0);

            adapter.onStoryChanged(storyChanged);
            services.mockEventBus.fire("commandStack.changed");
            vi.advanceTimersByTime(DEFAULT_DEBOUNCE_MS);
            expect(storyChanged).toHaveBeenCalledTimes(2);

            services.mockEventBus.fire("commandStack.changed");
            adapter.destroy();
            vi.advanceTimersByTime(DEFAULT_DEBOUNCE_MS);
            expect(storyChanged).toHaveBeenCalledTimes(2);
        });

        it("makes duplicate viewport subscriptions idempotent through off, resubscribe, and destroy", () => {
            const viewportChanged = vi.fn();
            const first = { x: 1, y: 1, width: 10, height: 10 };
            adapter.onViewportChanged(viewportChanged);
            services.mockEventBus.fire("canvas.viewbox.changed", {
                viewbox: first,
            });

            adapter.onViewportChanged(viewportChanged);
            expect(services.mockEventBus.listenerCount()).toBe(1);
            vi.advanceTimersByTime(DEFAULT_DEBOUNCE_MS);
            expect(viewportChanged).toHaveBeenCalledTimes(1);
            expect(viewportChanged).toHaveBeenLastCalledWith(first);

            services.mockEventBus.fire("canvas.viewbox.changed", {
                viewbox: first,
            });
            adapter.offViewportChanged(viewportChanged);
            vi.advanceTimersByTime(DEFAULT_DEBOUNCE_MS);
            expect(viewportChanged).toHaveBeenCalledTimes(1);

            const second = { x: 2, y: 2, width: 20, height: 20 };
            adapter.onViewportChanged(viewportChanged);
            services.mockEventBus.fire("canvas.viewbox.changed", {
                viewbox: second,
            });
            vi.advanceTimersByTime(DEFAULT_DEBOUNCE_MS);
            expect(viewportChanged).toHaveBeenCalledTimes(2);
            expect(viewportChanged).toHaveBeenLastCalledWith(second);

            services.mockEventBus.fire("canvas.viewbox.changed", {
                viewbox: second,
            });
            adapter.destroy();
            vi.advanceTimersByTime(DEFAULT_DEBOUNCE_MS);
            expect(viewportChanged).toHaveBeenCalledTimes(2);
        });

        it("makes duplicate import-repair subscriptions idempotent through off, resubscribe, and destroy", () => {
            const importRepaired = vi.fn();
            const repaired = { removedConnections: [{ id: "connection_1" }] };
            adapter.onImportRepaired(importRepaired);
            adapter.onImportRepaired(importRepaired);

            services.mockEventBus.fire("dst.import.repaired", repaired);
            expect(importRepaired).toHaveBeenCalledTimes(1);
            expect(services.mockEventBus.listenerCount()).toBe(1);

            adapter.offImportRepaired(importRepaired);
            services.mockEventBus.fire("dst.import.repaired", repaired);
            expect(importRepaired).toHaveBeenCalledTimes(1);

            adapter.onImportRepaired(importRepaired);
            services.mockEventBus.fire("dst.import.repaired", repaired);
            expect(importRepaired).toHaveBeenCalledTimes(2);

            adapter.destroy();
            services.mockEventBus.fire("dst.import.repaired", repaired);
            expect(importRepaired).toHaveBeenCalledTimes(2);
        });

        it("keeps one function's two subscriptions independent", () => {
            // A `() => void` callback fits both event signatures.
            const shared = vi.fn();
            adapter.onStoryChanged(shared);
            adapter.onViewportChanged(shared);

            adapter.offStoryChanged(shared);
            services.mockEventBus.fire("commandStack.changed");
            services.mockEventBus.fire("canvas.viewbox.changed", {
                viewbox: { x: 0, y: 0, width: 1, height: 1 },
            });
            vi.advanceTimersByTime(DEFAULT_DEBOUNCE_MS);

            expect(shared).toHaveBeenCalledTimes(1);
        });
    });

    describe("icon stylesheet wiring", () => {
        it("hands its style node and canvas scope to the icon stylesheet adapter", () => {
            // Pins the DI key; IconCssInjector's `$inject` string is unchecked.
            const config = diagramOptions[0]!["domainStoryIconStyleSheet"];
            expect(config.styleElement).toBe(
                container.querySelector(ICON_STYLE_SELECTOR),
            );
            expect(config.scopeId).toEqual(expect.any(String));
            expect(config.scopeId).not.toBe("");
            expect(
                canvasContainers[0]!.getAttribute("data-egon-icon-scope"),
            ).toBe(config.scopeId);
        });

        it("gives two adapters on one container two separate nodes", () => {
            const second = new DiagramJsModelerAdapter(
                container,
                "100%",
                "100%",
            );

            const nodes = container.querySelectorAll(ICON_STYLE_SELECTOR);
            expect(nodes.length).toBe(2);
            expect(
                diagramOptions[1]!["domainStoryIconStyleSheet"].styleElement,
            ).not.toBe(
                diagramOptions[0]!["domainStoryIconStyleSheet"].styleElement,
            );
            expect(
                diagramOptions[1]!["domainStoryIconStyleSheet"].scopeId,
            ).not.toBe(diagramOptions[0]!["domainStoryIconStyleSheet"].scopeId);
            expect(
                canvasContainers[1]!.getAttribute("data-egon-icon-scope"),
            ).toBe(diagramOptions[1]!["domainStoryIconStyleSheet"].scopeId);

            adapter.destroy();

            expect(container.querySelectorAll(ICON_STYLE_SELECTOR).length).toBe(
                1,
            );
            expect(container.querySelector(ICON_STYLE_SELECTOR)).toBe(
                diagramOptions[1]!["domainStoryIconStyleSheet"].styleElement,
            );

            second.destroy();
        });
    });

    describe("text renderer wiring", () => {
        it("passes the host's typography as the `textRenderer` config key", () => {
            // Pins the DI key; the renderer's `config.textRenderer` is unchecked.
            const textRenderer = { defaultStyle: { fontSize: 18 } };

            const configured = new DiagramJsModelerAdapter(
                container,
                "100%",
                "100%",
                [],
                textRenderer,
            );

            expect(diagramOptions[1]!["textRenderer"]).toBe(textRenderer);

            configured.destroy();
        });

        it("omits the key entirely when the host supplied nothing", () => {
            expect(diagramOptions[0]).not.toHaveProperty("textRenderer");
        });
    });
});
