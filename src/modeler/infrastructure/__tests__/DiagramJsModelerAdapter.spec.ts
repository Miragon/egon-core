import {
    describe,
    it,
    expect,
    beforeEach,
    afterEach,
    vi,
    type Mock,
} from "vitest";

/**
 * Stub the diagram-js services the adapter pulls out of the injector. `Diagram`
 * itself is mocked (below) so the constructor never boots a real canvas; each
 * `get()` here just hands back the matching spy object.
 */
function createMockDiagramServices() {
    const mockEventBus = {
        on: vi.fn(),
        off: vi.fn(),
    };

    const mockCanvas = {
        viewbox: vi.fn().mockReturnValue({ x: 0, y: 0, width: 100, height: 100 }),
        setRootElement: vi.fn(),
        zoom: vi.fn(),
    };

    const mockElementFactory = {
        createRoot: vi.fn().mockReturnValue({ id: "root" }),
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
            case "elementFactory":
                return mockElementFactory;
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
        mockElementFactory,
        mockAlignToOrigin,
    };
}

// Shared handle so the mocked Diagram constructor and the tests see the same
// service stubs; reassigned per test in beforeEach.
let services: ReturnType<typeof createMockDiagramServices>;

// Mock diagram-js so `new Diagram(...)` returns our stub injector instead of
// instantiating a real modeler (jsdom has no SVG canvas). The other modeler
// modules (plugin, import/export services) are pulled in only as `modules`
// config and never invoked here.
vi.mock("diagram-js", () => ({
    default: vi.fn(() => ({
        get: (name: string) => services.get(name),
        destroy: () => services.destroy(),
    })),
}));

import { DiagramJsModelerAdapter } from "../DiagramJsModelerAdapter";

describe("DiagramJsModelerAdapter", () => {
    let adapter: DiagramJsModelerAdapter;
    let container: HTMLElement;

    beforeEach(() => {
        services = createMockDiagramServices();
        container = document.createElement("div");
        adapter = new DiagramJsModelerAdapter(container, "100%", "100%");
    });

    afterEach(() => {
        vi.clearAllMocks();
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
});
