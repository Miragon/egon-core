import {
    describe,
    it,
    expect,
    beforeEach,
    afterEach,
    vi,
    type Mock,
} from "vitest";
import { DiagramJsIconAdapter } from "../DiagramJsIconAdapter";
import {
    IconCategory,
    IconSet,
    IconSetData,
} from "../../../iconSet/domain/IconTypes";
import type Diagram from "diagram-js";
import { ElementTypes } from "../../../story/domain/elementTypes";
import { DEFAULT_DEBOUNCE_MS } from "../../../shared/infrastructure/debounce";
import { createRecordingEventBus } from "./helpers/createRecordingEventBus";

/**
 * Creates mock diagram-js services for testing DiagramJsIconAdapter.
 */
function createMockDiagramServices() {
    const mockEventBus = createRecordingEventBus();

    const mockIconDictionaryService = {
        upsertIconForType: vi.fn(
            (_type: ElementTypes, _name: string, svg: string) => svg,
        ),
        unregisterIconForType: vi.fn(),
        addIconsToCss: vi.fn(),
        getIconSetName: vi.fn(() => ""),
    };

    const mockElementRegistry = {
        getAll: vi.fn(() => [] as Record<string, any>[]),
    };

    const mockIconSetImportExportService = {
        createIconSetConfiguration: vi.fn(
            (icons: Partial<IconSetData>) => icons,
        ),
        loadConfiguration: vi.fn(),
        getCurrentConfigurationForExport: vi.fn(() => ({
            actors: {},
            workObjects: {},
        })),
    };

    const mockDiagram = {
        get: vi.fn((serviceName: string) => {
            switch (serviceName) {
                case "eventBus":
                    return mockEventBus;
                case "domainStoryIconDictionaryService":
                    return mockIconDictionaryService;
                case "domainStoryIconSetImportExportService":
                    return mockIconSetImportExportService;
                case "elementRegistry":
                    return mockElementRegistry;
                default:
                    return {};
            }
        }),
    } as unknown as Diagram;

    return {
        mockDiagram,
        mockEventBus,
        mockIconDictionaryService,
        mockIconSetImportExportService,
        mockElementRegistry,
    };
}

describe("DiagramJsIconAdapter", () => {
    let adapter: DiagramJsIconAdapter;
    let mocks: ReturnType<typeof createMockDiagramServices>;

    beforeEach(() => {
        mocks = createMockDiagramServices();
        adapter = new DiagramJsIconAdapter(mocks.mockDiagram);
    });

    afterEach(() => {
        vi.clearAllMocks();
        vi.useRealTimers();
    });

    describe("loadIcons", () => {
        it("should create icon set configuration and load it", () => {
            const icons: IconSetData = { actors: { Test: "<svg>test</svg>" } };

            adapter.loadIcons(icons);

            expect(
                mocks.mockIconSetImportExportService.createIconSetConfiguration,
            ).toHaveBeenCalledWith({
                name: "",
                actors: icons.actors,
                workObjects: {},
            });
            expect(
                mocks.mockIconSetImportExportService.loadConfiguration,
            ).toHaveBeenCalled();
        });

        it("should keep the currently loaded icon-set name when none is given", () => {
            // e.g. a host reloading icons after importing a named icon set
            mocks.mockIconDictionaryService.getIconSetName.mockReturnValue(
                "default",
            );

            adapter.loadIcons({ actors: { Test: "<svg>test</svg>" } });

            expect(
                mocks.mockIconSetImportExportService.createIconSetConfiguration,
            ).toHaveBeenCalledWith(
                expect.objectContaining({ name: "default" }),
            );
        });

        it("should pass an explicit icon-set name through", () => {
            mocks.mockIconDictionaryService.getIconSetName.mockReturnValue(
                "default",
            );

            adapter.loadIcons({ name: "custom", actors: {} });

            expect(
                mocks.mockIconSetImportExportService.createIconSetConfiguration,
            ).toHaveBeenCalledWith(expect.objectContaining({ name: "custom" }));
        });

        it("should fire dst.config.changed event after loading icons", () => {
            const icons: IconSetData = { actors: { Test: "<svg>test</svg>" } };

            adapter.loadIcons(icons);

            expect(mocks.mockEventBus.fire).toHaveBeenCalledWith(
                "dst.config.changed",
                expect.objectContaining({ iconSet: expect.any(Object) }),
            );
        });
    });

    describe("addIcon", () => {
        it("should add actor icon to dictionary service", () => {
            const category: IconCategory = "actor";
            const name = "Robot";
            const svg = "<svg>robot</svg>";

            adapter.addIcon(category, name, svg);

            expect(
                mocks.mockIconDictionaryService.upsertIconForType,
            ).toHaveBeenCalledWith(ElementTypes.ACTOR, name, svg);
        });

        it("should add workObject icon to dictionary service", () => {
            const category: IconCategory = "workObject";
            const name = "Document";
            const svg = "<svg>document</svg>";

            adapter.addIcon(category, name, svg);

            expect(
                mocks.mockIconDictionaryService.upsertIconForType,
            ).toHaveBeenCalledWith(ElementTypes.WORKOBJECT, name, svg);
        });

        it("should add icon to CSS", () => {
            adapter.addIcon("actor", "Test", "<svg>test</svg>");

            expect(
                mocks.mockIconDictionaryService.addIconsToCss,
            ).toHaveBeenCalled();
        });

        it("should fire dst.config.changed event after adding icon", () => {
            adapter.addIcon("actor", "Test", "<svg>test</svg>");

            expect(mocks.mockEventBus.fire).toHaveBeenCalledWith(
                "dst.config.changed",
                expect.objectContaining({ iconSet: expect.any(Object) }),
            );
        });

        it("publishes sanitized CSS, repaints exact live matches across categories, then notifies configuration", () => {
            const sanitized = "<svg>sanitized</svg>";
            mocks.mockIconDictionaryService.upsertIconForType.mockReturnValue(
                sanitized,
            );
            const actor = {
                id: "actor",
                type: ElementTypes.ACTOR + "Shared",
                businessObject: {},
            };
            const nestedObject = {
                id: "nested-object",
                type: ElementTypes.WORKOBJECT + "Shared",
                parent: { id: "group" },
                businessObject: {},
            };
            mocks.mockElementRegistry.getAll.mockReturnValue([
                actor,
                nestedObject,
                {
                    id: "other-name",
                    type: ElementTypes.ACTOR + "SharedExtra",
                    businessObject: {},
                },
                {
                    id: "activity",
                    type: ElementTypes.ACTIVITY,
                    businessObject: {},
                },
                {
                    id: "actor-label",
                    type: ElementTypes.ACTOR + "Shared",
                    labelTarget: actor,
                    businessObject: {},
                },
            ]);

            adapter.addIcon("actor", "Shared", "<svg>unsafe</svg>");

            const cssDictionary =
                mocks.mockIconDictionaryService.addIconsToCss.mock.calls[0][0];
            expect(cssDictionary.toRecord()).toEqual({ Shared: sanitized });
            expect(mocks.mockEventBus.fire).toHaveBeenNthCalledWith(
                1,
                "elements.changed",
                { elements: [actor, nestedObject] },
            );
            expect(mocks.mockEventBus.fire).toHaveBeenNthCalledWith(
                2,
                "dst.config.changed",
                expect.objectContaining({ iconSet: expect.any(Object) }),
            );
            expect(
                mocks.mockIconDictionaryService.upsertIconForType.mock
                    .invocationCallOrder[0],
            ).toBeLessThan(
                mocks.mockIconDictionaryService.addIconsToCss.mock
                    .invocationCallOrder[0],
            );
            expect(
                mocks.mockIconDictionaryService.addIconsToCss.mock
                    .invocationCallOrder[0],
            ).toBeLessThan(mocks.mockEventBus.fire.mock.invocationCallOrder[0]);
        });

        it("skips elements.changed when no live shape uses the name", () => {
            mocks.mockElementRegistry.getAll.mockReturnValue([
                {
                    id: "unrelated",
                    type: ElementTypes.ACTOR + "Other",
                    businessObject: {},
                },
            ]);

            adapter.addIcon("actor", "Shared", "<svg/>");

            expect(
                mocks.mockEventBus.fire.mock.calls.map(([event]) => event),
            ).toEqual(["dst.config.changed"]);
        });

        it("uses the active diagram after a session promotion", () => {
            const first = createMockDiagramServices();
            const promoted = createMockDiagramServices();
            let active = first.mockDiagram;
            const owner = {
                getActiveDiagram: vi.fn(() => active),
                onPromotion: vi.fn(() => vi.fn()),
            };
            const followingAdapter = new DiagramJsIconAdapter(owner as any);

            active = promoted.mockDiagram;
            followingAdapter.addIcon("actor", "Current", "<svg/>");

            expect(
                first.mockIconDictionaryService.upsertIconForType,
            ).not.toHaveBeenCalled();
            expect(
                promoted.mockIconDictionaryService.upsertIconForType,
            ).toHaveBeenCalledWith(ElementTypes.ACTOR, "Current", "<svg/>");
            expect(promoted.mockElementRegistry.getAll).toHaveBeenCalledTimes(
                1,
            );
        });
    });

    describe("removeIcon", () => {
        it("should remove actor icon from dictionary service", () => {
            adapter.removeIcon("actor", "Robot");

            expect(
                mocks.mockIconDictionaryService.unregisterIconForType,
            ).toHaveBeenCalledWith(ElementTypes.ACTOR, "Robot");
        });

        it("should remove workObject icon from dictionary service", () => {
            adapter.removeIcon("workObject", "Document");

            expect(
                mocks.mockIconDictionaryService.unregisterIconForType,
            ).toHaveBeenCalledWith(ElementTypes.WORKOBJECT, "Document");
        });

        it("should fire dst.config.changed event after removing icon", () => {
            adapter.removeIcon("actor", "Test");

            expect(mocks.mockEventBus.fire).toHaveBeenCalledWith(
                "dst.config.changed",
                expect.objectContaining({ iconSet: expect.any(Object) }),
            );
        });
    });

    describe("getIcons", () => {
        it("should return icons from IconSetImportExportService", () => {
            const expectedIcons: IconSet = {
                actors: { Existing: "<svg>existing</svg>" },
                workObjects: { Report: "<svg>report</svg>" },
            };
            (
                mocks.mockIconSetImportExportService
                    .getCurrentConfigurationForExport as Mock
            ).mockReturnValue(expectedIcons);

            const result = adapter.getIcons();

            expect(result).toEqual(expectedIcons);
        });

        it("should return empty IconSet when service returns undefined", () => {
            (
                mocks.mockIconSetImportExportService
                    .getCurrentConfigurationForExport as Mock
            ).mockReturnValue(undefined);

            const result = adapter.getIcons();

            expect(result).toEqual({ actors: {}, workObjects: {} });
        });
    });

    describe("hasIcon", () => {
        it("should return true when actor icon exists", () => {
            const existingIcons: IconSet = {
                actors: { Present: "<svg>p</svg>" },
                workObjects: {},
            };
            (
                mocks.mockIconSetImportExportService
                    .getCurrentConfigurationForExport as Mock
            ).mockReturnValue(existingIcons);

            expect(adapter.hasIcon("actor", "Present")).toBe(true);
        });

        it("should return false when actor icon does not exist", () => {
            const existingIcons: IconSet = { actors: {}, workObjects: {} };
            (
                mocks.mockIconSetImportExportService
                    .getCurrentConfigurationForExport as Mock
            ).mockReturnValue(existingIcons);

            expect(adapter.hasIcon("actor", "Missing")).toBe(false);
        });

        it("should return true when workObject icon exists", () => {
            const existingIcons: IconSet = {
                actors: {},
                workObjects: { Document: "<svg>d</svg>" },
            };
            (
                mocks.mockIconSetImportExportService
                    .getCurrentConfigurationForExport as Mock
            ).mockReturnValue(existingIcons);

            expect(adapter.hasIcon("workObject", "Document")).toBe(true);
        });
    });

    describe("event subscription", () => {
        it("should subscribe to icon changes via EventBus", () => {
            const callback = vi.fn();

            adapter.onIconsChanged(callback);

            expect(mocks.mockEventBus.on).toHaveBeenCalledWith(
                "dst.config.changed",
                expect.any(Function),
            );
        });

        it("should unsubscribe from icon changes via EventBus", () => {
            const callback = vi.fn();
            adapter.onIconsChanged(callback);

            adapter.offIconsChanged(callback);

            expect(mocks.mockEventBus.off).toHaveBeenCalledWith(
                "dst.config.changed",
                expect.any(Function),
            );
        });
    });

    /**
     * Timer-level teardown (#69). Fake timers are legal in this tier only
     * (ADR 0014); nothing here drives a real canvas.
     */
    describe("debouncing and teardown", () => {
        beforeEach(() => {
            vi.useFakeTimers();
        });

        it("collapses a burst of dst.config.changed into one callback", () => {
            const iconsChanged = vi.fn();
            adapter.onIconsChanged(iconsChanged);

            for (let index = 0; index < 5; index++) {
                mocks.mockEventBus.fire("dst.config.changed");
            }
            vi.advanceTimersByTime(DEFAULT_DEBOUNCE_MS);

            // Five before the fix: the debouncer was rebuilt per event.
            expect(iconsChanged).toHaveBeenCalledTimes(1);
        });

        it("cancels a callback already in flight when destroyed", () => {
            const iconsChanged = vi.fn();
            adapter.onIconsChanged(iconsChanged);
            mocks.mockEventBus.fire("dst.config.changed");

            adapter.destroy();
            vi.advanceTimersByTime(DEFAULT_DEBOUNCE_MS * 10);

            // Would otherwise call getIcons() on a torn-down injector.
            expect(iconsChanged).not.toHaveBeenCalled();
        });

        it("unsubscribes every handler on destroy", () => {
            adapter.onIconsChanged(vi.fn());
            adapter.onIconsChanged(vi.fn());
            const subscribed = mocks.mockEventBus.on.mock.calls;

            adapter.destroy();

            // Identity-matched: eventBus.off ignores a handle it never saw.
            expect(mocks.mockEventBus.off.mock.calls).toEqual(subscribed);
            expect(mocks.mockEventBus.listenerCount()).toBe(0);
        });

        it("delivers nothing after off(), even mid-window", () => {
            const iconsChanged = vi.fn();
            adapter.onIconsChanged(iconsChanged);

            mocks.mockEventBus.fire("dst.config.changed");
            adapter.offIconsChanged(iconsChanged);
            vi.advanceTimersByTime(DEFAULT_DEBOUNCE_MS);

            expect(iconsChanged).not.toHaveBeenCalled();
        });

        it("makes duplicate subscriptions idempotent through off, resubscribe, and destroy", () => {
            const iconsChanged = vi.fn();
            adapter.onIconsChanged(iconsChanged);
            mocks.mockEventBus.fire("dst.config.changed");

            // A duplicate while the timer is armed must neither replace and
            // orphan that timer nor attach another listener.
            adapter.onIconsChanged(iconsChanged);
            expect(mocks.mockEventBus.listenerCount()).toBe(1);
            vi.advanceTimersByTime(DEFAULT_DEBOUNCE_MS);
            expect(iconsChanged).toHaveBeenCalledTimes(1);

            mocks.mockEventBus.fire("dst.config.changed");
            adapter.offIconsChanged(iconsChanged);
            vi.advanceTimersByTime(DEFAULT_DEBOUNCE_MS);
            expect(iconsChanged).toHaveBeenCalledTimes(1);
            expect(mocks.mockEventBus.listenerCount()).toBe(0);

            adapter.onIconsChanged(iconsChanged);
            mocks.mockEventBus.fire("dst.config.changed");
            vi.advanceTimersByTime(DEFAULT_DEBOUNCE_MS);
            expect(iconsChanged).toHaveBeenCalledTimes(2);

            mocks.mockEventBus.fire("dst.config.changed");
            adapter.destroy();
            vi.advanceTimersByTime(DEFAULT_DEBOUNCE_MS);
            expect(iconsChanged).toHaveBeenCalledTimes(2);
        });
    });
});
