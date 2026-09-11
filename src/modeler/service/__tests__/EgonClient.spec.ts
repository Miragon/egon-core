import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    type Mock,
    vi,
} from "vitest";
import { EgonClient } from "../EgonClient";
import { IconPort, ModelerPort } from "../../domain/ports";
import { EgonClientConfig } from "../EgonClientConfig";
import {
    DomainStoryDocument,
    IconCategory,
    IconSet,
    IconSetData,
    ViewportData,
} from "../../domain";

/**
 * Creates mock ports for testing EgonClient.
 * Uses constructor injection to bypass real adapter creation.
 */
function createMockPorts() {
    const mockModelerPort: ModelerPort = {
        import: vi.fn(),
        export: vi.fn(),
        getViewport: vi
            .fn()
            .mockReturnValue({ x: 0, y: 0, width: 100, height: 100 }),
        setViewport: vi.fn(),
        alignToOrigin: vi.fn(),
        fitToScreen: vi.fn(),
        onStoryChanged: vi.fn(),
        onViewportChanged: vi.fn(),
        onImportRepaired: vi.fn(),
        offStoryChanged: vi.fn(),
        offViewportChanged: vi.fn(),
        offImportRepaired: vi.fn(),
        onColorPickerRequested: vi.fn(),
        onColorPickerClosed: vi.fn(),
        offColorPickerRequested: vi.fn(),
        offColorPickerClosed: vi.fn(),
        previewPickedColor: vi.fn(),
        confirmPickedColor: vi.fn(),
        cancelColorPicker: vi.fn(),
        destroy: vi.fn(),
    };

    const mockIconPort: IconPort = {
        loadIcons: vi.fn(),
        addIcon: vi.fn(),
        removeIcon: vi.fn(),
        getIcons: vi.fn().mockReturnValue({ actors: {}, workObjects: {} }),
        hasIcon: vi.fn(),
        onIconsChanged: vi.fn(),
        offIconsChanged: vi.fn(),
        destroy: vi.fn(),
    };

    return { mockModelerPort, mockIconPort };
}

describe("EgonClient (Application Service)", () => {
    let mockModelerPort: ModelerPort;
    let mockIconPort: IconPort;
    let client: EgonClient;
    let container: HTMLElement;

    beforeEach(async () => {
        container = document.createElement("div");
        document.body.appendChild(container);

        const ports = createMockPorts();
        mockModelerPort = ports.mockModelerPort;
        mockIconPort = ports.mockIconPort;

        const config: EgonClientConfig = {
            container,
            width: "100%",
            height: "100%",
        };

        // Use constructor injection to provide mock ports
        client = await EgonClient.create(config, [], {
            modelerPort: mockModelerPort,
            iconPort: mockIconPort,
        });
    });

    afterEach(() => {
        container.remove();
        vi.clearAllMocks();
    });

    describe("constructor with initial viewport", () => {
        it("should set initial viewport when provided in config", async () => {
            const initialViewport: ViewportData = {
                x: 10,
                y: 20,
                width: 800,
                height: 600,
            };
            const config: EgonClientConfig = {
                container,
                viewport: initialViewport,
            };

            const ports = createMockPorts();
            // Create client with viewport config to trigger setViewport call
            await EgonClient.create(config, [], {
                modelerPort: ports.mockModelerPort,
                iconPort: ports.mockIconPort,
            });

            expect(ports.mockModelerPort.setViewport).toHaveBeenCalledWith(
                initialViewport,
            );
        });
    });

    describe("document operations", () => {
        it("should delegate import to modeler port", () => {
            const doc: DomainStoryDocument = {
                iconSet: { name: "", actors: {}, workObjects: {} },
                domainStory: {
                    businessObjects: [],
                    title: "",
                    description: "",
                    version: "4.0.0",
                },
            };
            client.import(doc);

            expect(mockModelerPort.import).toHaveBeenCalledWith(doc);
        });

        it("should delegate export to modeler port", () => {
            const doc: DomainStoryDocument = {
                iconSet: { name: "", actors: {}, workObjects: {} },
                domainStory: {
                    businessObjects: [],
                    title: "",
                    description: "",
                    version: "4.0.0",
                },
            };
            (mockModelerPort.export as Mock).mockReturnValue(doc);

            const result = client.export();

            expect(result).toEqual(doc);
            expect(mockModelerPort.export).toHaveBeenCalledTimes(1);
        });
    });

    describe("event subscription", () => {
        it("should route story.changed to modeler port", () => {
            const callback = vi.fn();
            client.on("story.changed", callback);

            expect(mockModelerPort.onStoryChanged).toHaveBeenCalledWith(
                callback,
            );
        });

        it("should route viewport.changed to modeler port", () => {
            const callback = vi.fn();
            client.on("viewport.changed", callback);

            expect(mockModelerPort.onViewportChanged).toHaveBeenCalledWith(
                callback,
            );
        });

        it("should route import.repaired to modeler port", () => {
            const callback = vi.fn();
            client.on("import.repaired", callback);

            expect(mockModelerPort.onImportRepaired).toHaveBeenCalledWith(
                callback,
            );
        });

        it("should route icons.changed to icon port", () => {
            const callback = vi.fn();
            client.on("icons.changed", callback);

            expect(mockIconPort.onIconsChanged).toHaveBeenCalledWith(callback);
        });

        it.each([
            ["colorPicker.requested", "onColorPickerRequested"],
            ["colorPicker.closed", "onColorPickerClosed"],
        ] as const)("routes %s to the modeler port", (event, method) => {
            const callback = vi.fn();
            client.on(event, callback);
            expect(mockModelerPort[method]).toHaveBeenCalledWith(callback);
        });

        it("rejects an unknown event in on without calling a port", () => {
            const callback = vi.fn();
            const javascriptClient = client as unknown as {
                on(event: string, callback: () => void): void;
            };

            expect(() =>
                javascriptClient.on("unknown.event", callback),
            ).toThrow(new TypeError("Unknown Egon event: unknown.event"));
            expect(mockModelerPort.onStoryChanged).not.toHaveBeenCalled();
            expect(mockModelerPort.onViewportChanged).not.toHaveBeenCalled();
            expect(mockModelerPort.onImportRepaired).not.toHaveBeenCalled();
            expect(mockIconPort.onIconsChanged).not.toHaveBeenCalled();
        });

        it("should route off story.changed to modeler port", () => {
            const callback = vi.fn();
            client.off("story.changed", callback);

            expect(mockModelerPort.offStoryChanged).toHaveBeenCalledWith(
                callback,
            );
        });

        it("should route off viewport.changed to modeler port", () => {
            const callback = vi.fn();
            client.off("viewport.changed", callback);

            expect(mockModelerPort.offViewportChanged).toHaveBeenCalledWith(
                callback,
            );
        });

        it("should route off import.repaired to modeler port", () => {
            const callback = vi.fn();
            client.off("import.repaired", callback);

            expect(mockModelerPort.offImportRepaired).toHaveBeenCalledWith(
                callback,
            );
        });

        it("should route off icons.changed to icon port", () => {
            const callback = vi.fn();
            client.off("icons.changed", callback);

            expect(mockIconPort.offIconsChanged).toHaveBeenCalledWith(callback);
        });

        it.each([
            ["colorPicker.requested", "offColorPickerRequested"],
            ["colorPicker.closed", "offColorPickerClosed"],
        ] as const)("routes off %s to the modeler port", (event, method) => {
            const callback = vi.fn();
            client.off(event, callback);
            expect(mockModelerPort[method]).toHaveBeenCalledWith(callback);
        });

        it("rejects an unknown event in off without calling a port", () => {
            const callback = vi.fn();
            const javascriptClient = client as unknown as {
                off(event: string, callback: () => void): void;
            };

            expect(() =>
                javascriptClient.off("unknown.event", callback),
            ).toThrow(new TypeError("Unknown Egon event: unknown.event"));
            expect(mockModelerPort.offStoryChanged).not.toHaveBeenCalled();
            expect(mockModelerPort.offViewportChanged).not.toHaveBeenCalled();
            expect(mockModelerPort.offImportRepaired).not.toHaveBeenCalled();
            expect(mockIconPort.offIconsChanged).not.toHaveBeenCalled();
        });
    });

    describe("viewport operations", () => {
        const mockViewport: ViewportData = {
            x: 10,
            y: 20,
            width: 900,
            height: 700,
        };

        it("should delegate getViewport to modeler port", () => {
            (mockModelerPort.getViewport as Mock).mockReturnValue(mockViewport);
            const result = client.getViewport();

            expect(result).toEqual(mockViewport);
            expect(mockModelerPort.getViewport).toHaveBeenCalledTimes(1);
        });

        it("should delegate setViewport to modeler port", () => {
            client.setViewport(mockViewport);

            expect(mockModelerPort.setViewport).toHaveBeenCalledWith(
                mockViewport,
            );
        });

        it("should delegate alignToOrigin to modeler port", () => {
            client.alignToOrigin();

            expect(mockModelerPort.alignToOrigin).toHaveBeenCalledTimes(1);
        });

        it("should delegate fitToScreen to modeler port", () => {
            client.fitToScreen();

            expect(mockModelerPort.fitToScreen).toHaveBeenCalledTimes(1);
        });
    });

    describe("color picker responses", () => {
        it.each([
            ["previewPickedColor", "previewPickedColor"],
            ["confirmPickedColor", "confirmPickedColor"],
        ] as const)(
            "delegates %s and returns its result",
            (clientMethod, portMethod) => {
                (mockModelerPort[portMethod] as Mock).mockReturnValue(true);

                expect(client[clientMethod]("request-1", "#ff0000")).toBe(true);
                expect(mockModelerPort[portMethod]).toHaveBeenCalledWith(
                    "request-1",
                    "#ff0000",
                );
            },
        );

        it("delegates cancellation and returns its result", () => {
            (mockModelerPort.cancelColorPicker as Mock).mockReturnValue(true);

            expect(client.cancelColorPicker("request-1")).toBe(true);
            expect(mockModelerPort.cancelColorPicker).toHaveBeenCalledWith(
                "request-1",
            );
        });

        it("returns false without touching the port after destruction", () => {
            client.destroy();

            expect(client.previewPickedColor("request-1", "#ff0000")).toBe(
                false,
            );
            expect(client.confirmPickedColor("request-1", "#ff0000")).toBe(
                false,
            );
            expect(client.cancelColorPicker("request-1")).toBe(false);
            expect(mockModelerPort.previewPickedColor).not.toHaveBeenCalled();
            expect(mockModelerPort.confirmPickedColor).not.toHaveBeenCalled();
            expect(mockModelerPort.cancelColorPicker).not.toHaveBeenCalled();
        });
    });

    describe("icon management", () => {
        const mockIconSet: IconSetData = {
            actors: { TestActor: "<svg>test</svg>" },
            workObjects: {},
        };

        it("should delegate loadIcons to icon port", () => {
            client.loadIcons(mockIconSet);

            expect(mockIconPort.loadIcons).toHaveBeenCalledWith(mockIconSet);
        });

        it("should delegate addIcon to icon port", () => {
            const category: IconCategory = "actor";
            const name = "NewActor";
            const svg = "<svg>new</svg>";
            client.addIcon(category, name, svg);

            expect(mockIconPort.addIcon).toHaveBeenCalledWith(
                category,
                name,
                svg,
            );
        });

        it("should delegate removeIcon to icon port", () => {
            const category: IconCategory = "workObject";
            const name = "OldObject";
            client.removeIcon(category, name);

            expect(mockIconPort.removeIcon).toHaveBeenCalledWith(
                category,
                name,
            );
        });

        it("should delegate getIcons to icon port", () => {
            const currentIcons: IconSet = {
                actors: { Existing: "<svg>existing</svg>" },
                workObjects: {},
            };
            (mockIconPort.getIcons as Mock).mockReturnValue(currentIcons);
            const result = client.getIcons();

            expect(result).toEqual(currentIcons);
            expect(mockIconPort.getIcons).toHaveBeenCalledTimes(1);
        });

        it("should delegate hasIcon to icon port", () => {
            (mockIconPort.hasIcon as Mock).mockReturnValue(true);
            const result = client.hasIcon("actor", "CheckActor");

            expect(result).toBe(true);
            expect(mockIconPort.hasIcon).toHaveBeenCalledWith(
                "actor",
                "CheckActor",
            );
        });
    });

    describe("lifecycle", () => {
        it("should destroy both ports", () => {
            client.destroy();

            // Both, not just the modeler: the icon port owns its own
            // subscriptions and debounce timers (#69).
            expect(mockIconPort.destroy).toHaveBeenCalledTimes(1);
            expect(mockModelerPort.destroy).toHaveBeenCalledTimes(1);
        });
    });
});
