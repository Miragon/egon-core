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

/**
 * Stub the diagram-js services the adapter pulls out of the injector. `Diagram`
 * itself is mocked (below) so the constructor never boots a real canvas; each
 * `get()` here just hands back the matching spy object.
 */
function createMockDiagramServices() {
    const mockEventBus = createRecordingEventBus();

    const mockCanvas = {
        viewbox: vi
            .fn()
            .mockReturnValue({ x: 0, y: 0, width: 100, height: 100 }),
        // The adapter realizes diagram-js' *implicit* root at boot — the real
        // `getRootElement()` creates and installs one when none is set. It must
        // be the implicit root because `isBackground` keys off that id prefix.
        getRootElement: vi
            .fn()
            .mockReturnValue({ id: "__implicitroot_0", children: [] }),
        zoom: vi.fn(),
    };

    const mockAlignToOrigin = {
        align: vi.fn(),
    };

    const get = vi.fn((serviceName: string) => {
        switch (serviceName) {
            case "eventBus":
                return mockEventBus;
            case "canvas":
                return mockCanvas;
            case "alignToOrigin":
                return mockAlignToOrigin;
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
    };
}

// Shared handle so the mocked Diagram constructor and the tests see the same
// service stubs; reassigned per test in beforeEach.
let services: ReturnType<typeof createMockDiagramServices>;

// Every options object the adapter handed to `new Diagram(...)`, so a case can
// assert on wiring that only exists as a DI config key — the compiler cannot
// check those strings from the producer side.
let diagramOptions: Record<string, any>[] = [];

// Mock diagram-js so `new Diagram(...)` returns our stub injector instead of
// instantiating a real modeler (jsdom has no SVG canvas). The other modeler
// modules (plugin, import/export services) are pulled in only as `modules`
// config and never invoked here.
vi.mock("diagram-js", () => ({
    default: vi.fn((options: Record<string, any>) => {
        diagramOptions.push(options);
        return {
            get: (name: string) => services.get(name),
            destroy: () => services.destroy(),
        };
    }),
}));

import { DiagramJsModelerAdapter } from "../DiagramJsModelerAdapter";
import { DEFAULT_DEBOUNCE_MS } from "../../../shared/infrastructure/debounce";

/** The style node the adapter injects into a host container. */
const ICON_STYLE_SELECTOR = "[data-egon-icons-css]";

describe("DiagramJsModelerAdapter", () => {
    let adapter: DiagramJsModelerAdapter;
    let container: HTMLElement;

    beforeEach(() => {
        services = createMockDiagramServices();
        diagramOptions = [];
        container = document.createElement("div");
        adapter = new DiagramJsModelerAdapter(container, "100%", "100%");
    });

    afterEach(() => {
        vi.clearAllMocks();
        vi.useRealTimers();
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

    /**
     * The debounce contract hosts actually observe. Fake timers are legal here
     * and only here (ADR 0014): this tier drives no real canvas, so freezing the
     * clock stalls nothing but the debounce itself.
     */
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

            // Five before the fix: a debouncer built per event shares no timer
            // with the previous one, so nothing coalesced.
            expect(storyChanged).toHaveBeenCalledTimes(1);
        });

        it("collapses a viewbox burst and delivers the last viewbox", () => {
            const viewportChanged = vi.fn();
            adapter.onViewportChanged(viewportChanged);

            services.mockEventBus.fire("canvas.viewbox.changed", {
                viewbox: { x: 1, y: 1, width: 10, height: 10 },
            });
            const last = { x: 9, y: 9, width: 90, height: 90 };
            services.mockEventBus.fire("canvas.viewbox.changed", {
                viewbox: last,
            });
            vi.advanceTimersByTime(DEFAULT_DEBOUNCE_MS);

            expect(viewportChanged).toHaveBeenCalledTimes(1);
            expect(viewportChanged).toHaveBeenCalledWith(last);
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

    /**
     * The one host event that is deliberately *not* debounced: an import fires
     * it at most once and a host that shows "this file was damaged" must not
     * learn about it a debounce window after `import()` returned (ADR 0017).
     */
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

            // Identity, not `expect.any(Function)`: eventBus.off is a no-op when
            // handed a different function, which is how a listener survives
            // teardown and reaches a destroyed injector.
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

            // Register again while delivery is pending. The original wrapper
            // and timer must survive, without adding a second listener.
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
            // `EgonEventMap` types `story.changed` as `() => void`, which is
            // assignable to the viewport signature too — so a host may pass one
            // function to both. A single union-keyed registry lost the first
            // handle on the second `on()`, leaving an uncancellable timer.
            const shared = vi.fn();
            adapter.onStoryChanged(shared);
            adapter.onViewportChanged(shared);

            adapter.offStoryChanged(shared);
            services.mockEventBus.fire("commandStack.changed");
            services.mockEventBus.fire("canvas.viewbox.changed", {
                viewbox: { x: 0, y: 0, width: 1, height: 1 },
            });
            vi.advanceTimersByTime(DEFAULT_DEBOUNCE_MS);

            // Only the viewport subscription survived.
            expect(shared).toHaveBeenCalledTimes(1);
        });
    });

    describe("icon stylesheet wiring", () => {
        it("hands its own style node to the icon stylesheet adapter", () => {
            // Pins the DI key name from the producer side; IconCssInjector's
            // `$inject` string is invisible to the compiler.
            expect(diagramOptions[0]!["domainStoryIconStyleSheet"]).toEqual({
                styleElement: container.querySelector(ICON_STYLE_SELECTOR),
            });
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

            // Destroying one must not take the other's sheet — the rules in it
            // belong to a client that is still alive.
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
            // Same producer-side pin as the icon stylesheet: the renderer's
            // `$inject` string `config.textRenderer` is invisible to the
            // compiler, so only the key name asserted here connects the two.
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
            // Not `{ textRenderer: undefined }`: didi would still resolve the
            // dotted key to undefined, but leaving the key out keeps the boot
            // options honest about what the host actually configured.
            expect(diagramOptions[0]).not.toHaveProperty("textRenderer");
        });
    });
});
