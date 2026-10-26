import { afterEach, describe, expect, it, vi } from "vitest";
import type CommandStack from "diagram-js/lib/command/CommandStack";
import type Canvas from "diagram-js/lib/core/Canvas";
import type ElementRegistry from "diagram-js/lib/core/ElementRegistry";
import type EventBus from "diagram-js/lib/core/EventBus";
import type { Shape } from "diagram-js/lib/model/Types";
import type { ModuleDeclaration } from "didi";

import {
    createTestDiagram,
    type TestDiagram,
} from "../../../__tests__/helpers/createTestDiagram";
import {
    TEST_ICON_NAMES,
    TEST_ICON_SET,
} from "../../../__tests__/helpers/testIconSet";
import { ElementTypes } from "../../../story/domain/elementTypes";
import type { DomainStoryDocument } from "../../../story/domain/DomainStoryDocument";
import { EgonClient } from "../EgonClient";
import type { ViewportData } from "../../domain";
import type { DomainStoryElementFactory } from "../../infrastructure/element-factory/DomainStoryElementFactory";
import type { DomainStoryModeling } from "../../infrastructure/modeling/DomainStoryModeling";
import type { IconDictionaryService } from "../../../iconSet/service";
import { defaultIcons } from "../../../icons";

/**
 * The public API on the real adapters. `EgonClient.spec.ts` proves routing
 * only; this pins the behaviour hosts depend on and upstream syncs break.
 *
 * Browser tier (ADR TST-2): `import()` reaches `canvas.addShape`, which needs
 * `SVGSVGElement.createSVGTransform`, and viewbox maths needs a real `getBBox`
 * and non-zero `viewbox().outer` (in jsdom `fitToScreen()` yields NaN).
 */

/** The adapters debounce host callbacks by this much before delivering them. */
const DEBOUNCE_MS = 100;

/**
 * Real timers, not `vi.useFakeTimers()`: freezing the clock would also stall
 * the browser-scheduled canvas rendering.
 */
function settle(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, DEBOUNCE_MS * 2.5));
}

/** `IconSetData` marks both maps optional; narrow them once, not per call site. */
const TEST_ACTOR_ICONS = TEST_ICON_SET.actors ?? {};
const TEST_WORK_OBJECT_ICONS = TEST_ICON_SET.workObjects ?? {};

/** Shape geometry as it survives an export — the only bounds the API exposes. */
interface ExportedBounds {
    x: number;
    y: number;
    width: number;
    height: number;
}

/**
 * Hand-built, not from `importFixture`: alignment cases need negative
 * coordinates beyond align-to-origin's 50 px tolerance, plus explicit sizes.
 * Carries TEST_ICON_SET because an actor with a missing icon throws on render.
 */
function storyAt(topLeft: { x: number; y: number }): DomainStoryDocument {
    return {
        iconSet: {
            name: "test-icons",
            actors: TEST_ACTOR_ICONS,
            workObjects: TEST_WORK_OBJECT_ICONS,
        },
        domainStory: {
            businessObjects: [
                {
                    id: "shape_actor",
                    type: ElementTypes.ACTOR + TEST_ICON_NAMES.person,
                    name: "Alice",
                    x: topLeft.x,
                    y: topLeft.y,
                    width: 75,
                    height: 75,
                },
                {
                    id: "shape_workobject",
                    type: ElementTypes.WORKOBJECT + TEST_ICON_NAMES.document,
                    name: "Report",
                    x: topLeft.x + 320,
                    y: topLeft.y + 240,
                    width: 75,
                    height: 75,
                },
            ],
            title: "browser-tier story",
            description: "",
            version: "4.0.0",
        },
    };
}

/**
 * `storyAt` plus an activity with a missing target: the damage
 * `pruneUnreferencedConnections` drops, and the only public way to fire
 * `import.repaired`.
 */
function storyWithDanglingActivity(topLeft: {
    x: number;
    y: number;
}): DomainStoryDocument {
    const story = storyAt(topLeft);
    return {
        ...story,
        domainStory: {
            ...story.domainStory,
            businessObjects: [
                ...story.domainStory.businessObjects,
                {
                    id: "connection_dangling",
                    type: ElementTypes.ACTIVITY,
                    name: "reports",
                    source: "shape_actor",
                    target: "shape_gone",
                    number: 1,
                    waypoints: [{ x: 0, y: 0 }],
                },
            ],
        },
    };
}

/** A story whose stable icon names point at visibly versioned SVG markup. */
function storyWithIconVersion(version: "A" | "B"): DomainStoryDocument {
    const story = storyAt({ x: 100, y: 100 });
    const versionedIcon = (shape: "circle" | "rect") =>
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" data-version="${version}">` +
        `<${shape} x="2" y="2" cx="12" cy="12" r="10" width="20" height="20" fill="#333"/>` +
        "</svg>";

    return {
        ...story,
        iconSet: {
            name: `version-${version}`,
            actors: {
                [TEST_ICON_NAMES.person]: versionedIcon("circle"),
            },
            workObjects: {
                [TEST_ICON_NAMES.document]: versionedIcon("rect"),
            },
        },
    };
}

/** A two-level group hierarchy whose live shapes use both icon categories. */
function nestedIconStory(): DomainStoryDocument {
    const actorSvg =
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" data-artwork="actor"><circle cx="12" cy="12" r="10" fill="#123"/></svg>';
    const workObjectSvg =
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" data-artwork="work-object"><rect x="2" y="2" width="20" height="20" fill="#456"/></svg>';

    return {
        iconSet: {
            name: "nested-icons",
            actors: { Person: actorSvg },
            workObjects: { Document: workObjectSvg },
        },
        domainStory: {
            businessObjects: [
                {
                    id: "group_outer",
                    type: ElementTypes.GROUP,
                    name: "Outer",
                    x: 40,
                    y: 40,
                    width: 500,
                    height: 400,
                },
                {
                    id: "group_inner",
                    type: ElementTypes.GROUP,
                    name: "Inner",
                    x: 90,
                    y: 90,
                    width: 350,
                    height: 250,
                    parent: "group_outer",
                },
                {
                    id: "nested_actor",
                    type: ElementTypes.ACTOR + "Person",
                    name: "Alice",
                    x: 140,
                    y: 140,
                    width: 75,
                    height: 75,
                    parent: "group_inner",
                },
                {
                    id: "nested_work_object",
                    type: ElementTypes.WORKOBJECT + "Document",
                    name: "Report",
                    x: 280,
                    y: 140,
                    width: 75,
                    height: 75,
                    parent: "group_inner",
                },
            ],
            title: "nested icon retention",
            description: "",
            version: "4.0.0",
        },
    };
}

function sharedNestedIconStory(): DomainStoryDocument {
    const story = nestedIconStory();
    const source =
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" data-revision="circle"><circle cx="12" cy="12" r="10"/></svg>';
    return {
        ...story,
        iconSet: {
            name: "shared-icons",
            actors: { Shared: source },
            workObjects: { Shared: source },
        },
        domainStory: {
            ...story.domainStory,
            businessObjects: story.domainStory.businessObjects.map(
                (unknownElement) => {
                    const element = unknownElement as Record<string, unknown>;
                    if (element["id"] === "nested_actor") {
                        return {
                            ...element,
                            type: ElementTypes.ACTOR + "Shared",
                        };
                    }
                    if (element["id"] === "nested_work_object") {
                        return {
                            ...element,
                            type: ElementTypes.WORKOBJECT + "Shared",
                        };
                    }
                    return element;
                },
            ),
        },
    };
}

function renderedIconVersion(
    container: HTMLElement,
    elementId: string,
): string | null {
    return (
        container
            .querySelector(`[data-element-id="${elementId}"] .djs-visual > svg`)
            ?.getAttribute("data-version") ?? null
    );
}

function iconRules(container: HTMLElement): CSSStyleRule[] {
    const style = container.querySelector<HTMLStyleElement>(
        "[data-egon-icons-css]",
    );
    return Array.from(style!.sheet!.cssRules) as CSSStyleRule[];
}

function iconSelector(container: HTMLElement, iconName: string): string {
    const scopeId = container
        .querySelector(".djs-container")!
        .getAttribute("data-egon-icon-scope");
    return `[data-egon-icon-scope="${scopeId}"] .icon-domain-story-${iconName}::before`.toLowerCase();
}

function svgPublishedFor(container: HTMLElement, iconName: string): string {
    const rule = iconRules(container).find(
        (candidate) =>
            candidate.selectorText === iconSelector(container, iconName),
    );
    const encoded = rule?.cssText.match(/base64,([^"')]+)/)?.[1];
    if (!encoded) {
        throw new Error(
            `no published CSS rule for ${iconName}: ${JSON.stringify(
                iconRules(container).map((candidate) => candidate.cssText),
            )}`,
        );
    }
    return atob(encoded);
}

/** Reads the positioned elements back out through the public export. */
function exportedBounds(client: EgonClient): ExportedBounds[] {
    return (client.export().domainStory.businessObjects as ExportedBounds[])
        .filter((element) => typeof element.x === "number")
        .map(({ x, y, width, height }) => ({ x, y, width, height }));
}

/**
 * Keeps the aspect ratio: diagram-js re-derives the scale from the outer box
 * and re-centres, so only an aspect-preserving box round-trips unchanged.
 */
function halfOf(viewport: ViewportData): ViewportData {
    return {
        x: 100,
        y: 50,
        width: viewport.width / 2,
        height: viewport.height / 2,
    };
}

/**
 * EgonClient exposes no undo, so this commandStack probe is the only way to
 * prove `alignToOrigin()` produced a revertible command.
 */
function commandStackProbe(): {
    module: ModuleDeclaration;
    commandStack(): CommandStack;
} {
    let captured: CommandStack | undefined;

    function capture(commandStack: CommandStack): void {
        captured = commandStack;
    }
    capture.$inject = ["commandStack"];

    return {
        module: { __init__: [capture] },
        commandStack: () => {
            if (!captured) {
                throw new Error("commandStack was never injected");
            }
            return captured;
        },
    };
}

/**
 * No public call emits an event burst, so firing raw events on this eventBus
 * probe is the only way to prove coalescing end-to-end.
 */
function eventBusProbe(): {
    module: ModuleDeclaration;
    eventBus(): EventBus;
} {
    let captured: EventBus | undefined;

    function capture(eventBus: EventBus): void {
        captured = eventBus;
    }
    capture.$inject = ["eventBus"];

    return {
        module: { __init__: [capture] },
        eventBus: () => {
            if (!captured) {
                throw new Error("eventBus was never injected");
            }
            return captured;
        },
    };
}

interface IconRefreshProbe {
    module: ModuleDeclaration;
    create(category: "actor" | "workObject", icon: string): Shape;
    commandStack(): CommandStack;
    dictionary(): IconDictionaryService;
}

/** Canvas-driving access used only to verify new-shape rendering and history. */
function iconRefreshProbe(): IconRefreshProbe {
    let canvas: Canvas | undefined;
    let elementFactory: DomainStoryElementFactory | undefined;
    let modeling: DomainStoryModeling | undefined;
    let commandStack: CommandStack | undefined;
    let dictionary: IconDictionaryService | undefined;
    let registry: ElementRegistry | undefined;
    let created = 0;

    function capture(
        injectedCanvas: Canvas,
        injectedElementFactory: DomainStoryElementFactory,
        injectedModeling: DomainStoryModeling,
        injectedCommandStack: CommandStack,
        injectedDictionary: IconDictionaryService,
        injectedRegistry: ElementRegistry,
    ): void {
        canvas = injectedCanvas;
        elementFactory = injectedElementFactory;
        modeling = injectedModeling;
        commandStack = injectedCommandStack;
        dictionary = injectedDictionary;
        registry = injectedRegistry;
    }
    capture.$inject = [
        "canvas",
        "elementFactory",
        "modeling",
        "commandStack",
        "domainStoryIconDictionaryService",
        "elementRegistry",
    ];

    const requireCaptured = () => {
        if (
            !canvas ||
            !elementFactory ||
            !modeling ||
            !commandStack ||
            !dictionary ||
            !registry
        ) {
            throw new Error("icon refresh probe was never injected");
        }
        return {
            canvas,
            elementFactory,
            modeling,
            commandStack,
            dictionary,
        };
    };

    return {
        module: { __init__: [capture] },
        create(category, icon) {
            const services = requireCaptured();
            const type =
                category === "actor"
                    ? ElementTypes.ACTOR
                    : ElementTypes.WORKOBJECT;
            const shape = services.elementFactory.create("shape", {
                type: type + icon,
            });
            created += 1;
            return services.modeling.createShape(
                shape,
                { x: 100 + created * 90, y: 500 },
                services.canvas.getRootElement() as unknown as Shape,
            );
        },
        commandStack: () => requireCaptured().commandStack,
        dictionary: () => requireCaptured().dictionary,
    };
}

function renderedArtwork(
    container: HTMLElement,
    elementId: string,
): string | undefined {
    return container
        .querySelector(`[data-element-id="${elementId}"] .djs-visual > svg`)
        ?.querySelector("circle, rect, polygon, path")?.localName;
}

describe("EgonClient on real adapters (browser)", () => {
    let diagram: TestDiagram | undefined;

    // One diagram per case, torn down here: leaked canvases — not file count —
    // are what makes this tier slow. Guarded because a failed boot leaves it unset.
    afterEach(() => {
        diagram?.cleanup();
        diagram = undefined;
    });

    describe("story.changed", () => {
        it("fires once, and only after the debounce window", async () => {
            diagram = await createTestDiagram();
            // Import uses canvas.addShape, not the commandStack, so the align
            // below is the only command in this case.
            diagram.client.import(storyAt({ x: -400, y: -300 }));

            const storyChanged = vi.fn();
            diagram.client.on("story.changed", storyChanged);
            diagram.client.alignToOrigin();

            expect(storyChanged).not.toHaveBeenCalled();

            await vi.waitFor(() =>
                expect(storyChanged).toHaveBeenCalledTimes(1),
            );
            await settle();

            // Align raises one commandStack.changed, so this pins
            // delivery-once; the burst case below tests coalescing.
            expect(storyChanged).toHaveBeenCalledTimes(1);
        });

        it("collapses a burst of diagram events into one callback", async () => {
            const probe = eventBusProbe();
            diagram = await createTestDiagram({}, [probe.module]);

            const storyChanged = vi.fn();
            diagram.client.on("story.changed", storyChanged);

            // Only a burst tells a coalescing debounce from one that merely
            // delays, and no public call emits one.
            for (let index = 0; index < 5; index++) {
                probe.eventBus().fire("commandStack.changed", {});
            }
            await settle();

            expect(storyChanged).toHaveBeenCalledTimes(1);
        });

        it("stops firing after off()", async () => {
            diagram = await createTestDiagram();
            diagram.client.import(storyAt({ x: -400, y: -300 }));

            const storyChanged = vi.fn();
            diagram.client.on("story.changed", storyChanged);
            diagram.client.off("story.changed", storyChanged);
            diagram.client.alignToOrigin();
            await settle();

            expect(storyChanged).not.toHaveBeenCalled();
        });
    });

    describe("viewport.changed", () => {
        it("fires with the applied viewbox on setViewport", async () => {
            diagram = await createTestDiagram();
            const viewportChanged = vi.fn();
            diagram.client.on("viewport.changed", viewportChanged);

            const target = halfOf(diagram.client.getViewport());
            diagram.client.setViewport(target);

            await vi.waitFor(() =>
                expect(viewportChanged).toHaveBeenCalledTimes(1),
            );
            const delivered = viewportChanged.mock.calls[0]![0] as ViewportData;
            expect(delivered.x).toBeCloseTo(target.x, 3);
            expect(delivered.y).toBeCloseTo(target.y, 3);
            expect(delivered.width).toBeCloseTo(target.width, 3);
        });

        it("stops firing after off()", async () => {
            diagram = await createTestDiagram();
            const viewportChanged = vi.fn();
            diagram.client.on("viewport.changed", viewportChanged);
            diagram.client.off("viewport.changed", viewportChanged);

            diagram.client.setViewport(halfOf(diagram.client.getViewport()));
            await settle();

            expect(viewportChanged).not.toHaveBeenCalled();
        });
    });

    describe("import.repaired", () => {
        it("delivers the dropped edge ids, synchronously during import()", async () => {
            diagram = await createTestDiagram();
            const importRepaired = vi.fn();
            diagram.client.on("import.repaired", importRepaired);

            diagram.client.import(
                storyWithDanglingActivity({ x: 100, y: 100 }),
            );

            // No `waitFor`: it must arrive before `import()` returns, or a host
            // cannot warn before the user saves the repaired story.
            expect(importRepaired).toHaveBeenCalledWith({
                removedConnectionIds: ["connection_dangling"],
            });
        });

        it("stays silent for an undamaged story", async () => {
            diagram = await createTestDiagram();
            const importRepaired = vi.fn();
            diagram.client.on("import.repaired", importRepaired);

            diagram.client.import(storyAt({ x: 100, y: 100 }));
            await settle();

            expect(importRepaired).not.toHaveBeenCalled();
        });

        it("stops firing after off()", async () => {
            diagram = await createTestDiagram();
            const importRepaired = vi.fn();
            diagram.client.on("import.repaired", importRepaired);
            diagram.client.off("import.repaired", importRepaired);

            diagram.client.import(
                storyWithDanglingActivity({ x: 100, y: 100 }),
            );
            await settle();

            expect(importRepaired).not.toHaveBeenCalled();
        });
    });

    describe("viewport round trip", () => {
        it("getViewport reports back what setViewport applied", async () => {
            diagram = await createTestDiagram();
            const target = halfOf(diagram.client.getViewport());

            diagram.client.setViewport(target);
            const current = diagram.client.getViewport();

            expect(current.x).toBeCloseTo(target.x, 3);
            expect(current.y).toBeCloseTo(target.y, 3);
            expect(current.width).toBeCloseTo(target.width, 3);
            expect(current.height).toBeCloseTo(target.height, 3);
        });
    });

    describe("alignToOrigin", () => {
        it("shifts every element to non-negative coordinates", async () => {
            diagram = await createTestDiagram();
            diagram.client.import(storyAt({ x: -400, y: -300 }));
            const before = exportedBounds(diagram.client);
            // Pins the premise: without both shapes off-canvas the loop below
            // would pass vacuously.
            expect(before).toHaveLength(2);
            expect(before.every((bounds) => bounds.x < 0)).toBe(true);

            diagram.client.alignToOrigin();

            for (const bounds of exportedBounds(diagram.client)) {
                expect(bounds.x).toBeGreaterThanOrEqual(0);
                expect(bounds.y).toBeGreaterThanOrEqual(0);
            }
        });

        it("is undoable — the shift is a revertible command", async () => {
            const probe = commandStackProbe();
            diagram = await createTestDiagram({}, [probe.module]);
            diagram.client.import(storyAt({ x: -400, y: -300 }));
            const before = exportedBounds(diagram.client);

            diagram.client.alignToOrigin();
            expect(exportedBounds(diagram.client)).not.toEqual(before);
            expect(probe.commandStack().canUndo()).toBe(true);

            probe.commandStack().undo();

            // Exact equality, not "negative again": undo must restore the
            // business objects the export reads, not just the rendered shapes.
            expect(exportedBounds(diagram.client)).toEqual(before);
        });
    });

    describe("fitToScreen", () => {
        it("yields a viewbox that encloses every element", async () => {
            diagram = await createTestDiagram();
            diagram.client.import(storyAt({ x: -400, y: -300 }));

            diagram.client.fitToScreen();

            const viewport = diagram.client.getViewport();
            // fitToScreen aligns first, so read the positions afterwards.
            const bounds = exportedBounds(diagram.client);
            expect(bounds).toHaveLength(2);
            for (const shape of bounds) {
                expect(shape.x).toBeGreaterThanOrEqual(viewport.x);
                expect(shape.y).toBeGreaterThanOrEqual(viewport.y);
                expect(shape.x + shape.width).toBeLessThanOrEqual(
                    viewport.x + viewport.width,
                );
                expect(shape.y + shape.height).toBeLessThanOrEqual(
                    viewport.y + viewport.height,
                );
            }
        });
    });

    describe("icons", () => {
        it("loads, renders, exports and re-imports the optional starter icons", async () => {
            const probe = iconRefreshProbe();
            diagram = await createTestDiagram({ defaultIcons }, [probe.module]);
            let reopened: TestDiagram | undefined;

            try {
                expect(diagram.client.getIconConfiguration().name).toBe(
                    "egon-default",
                );
                expect(
                    diagram.container.querySelector(
                        '[data-action="domainStory-actorPerson"]',
                    ),
                ).not.toBeNull();
                expect(
                    diagram.container.querySelector(
                        '[data-action="domainStory-workObjectDocument"]',
                    ),
                ).not.toBeNull();

                const actor = probe.create("actor", "Person");
                const workObject = probe.create("workObject", "Document");
                expect(renderedArtwork(diagram.container, actor.id)).toBe(
                    "path",
                );
                expect(renderedArtwork(diagram.container, workObject.id)).toBe(
                    "path",
                );

                const exported = diagram.client.export();
                expect(exported.iconSet.name).toBe("egon-default");
                expect(exported.iconSet.actors["Person"]).toContain(
                    "M12 4a4 4 0 1 1 0 8",
                );
                expect(exported.iconSet.workObjects["Document"]).toContain(
                    "M6 2h8l6 6v16",
                );

                reopened = await createTestDiagram();
                reopened.client.import(exported);
                expect(reopened.client.export().iconSet).toEqual(
                    exported.iconSet,
                );
                expect(renderedArtwork(reopened.container, actor.id)).toBe(
                    "path",
                );
                expect(renderedArtwork(reopened.container, workObject.id)).toBe(
                    "path",
                );
            } finally {
                reopened?.cleanup();
            }
        });

        it("keeps starter icon initialization isolated between clients", async () => {
            diagram = await createTestDiagram({ defaultIcons });
            const empty = await createTestDiagram();

            try {
                expect(diagram.client.hasIcon("actor", "Person")).toBe(true);
                expect(empty.client.getIcons()).toEqual({
                    actors: {},
                    workObjects: {},
                });
                expect(
                    empty.container.querySelector(
                        '[data-action="domainStory-actorPerson"]',
                    ),
                ).toBeNull();
            } finally {
                empty.cleanup();
            }
        });

        it("does not restore starter icons after later replacements", async () => {
            diagram = await createTestDiagram({ defaultIcons });

            diagram.client.loadIcons({
                name: "replacement",
                actors: {
                    Other: '<svg xmlns="http://www.w3.org/2000/svg"><circle cx="5" cy="5" r="5"/></svg>',
                },
                workObjects: {},
            });

            expect(diagram.client.hasIcon("actor", "Person")).toBe(false);
            expect(diagram.client.hasIcon("workObject", "Document")).toBe(
                false,
            );
            expect(diagram.client.hasIcon("actor", "Other")).toBe(true);

            diagram.client.import({
                iconSet: { name: "document", actors: {}, workObjects: {} },
                domainStory: {
                    businessObjects: [],
                    title: "",
                    description: "",
                    version: "4.0.0",
                },
            });

            expect(diagram.client.getIcons()).toEqual({
                actors: {},
                workObjects: {},
            });
        });

        it("loadIcons publishes the set to getIcons/hasIcon and fires icons.changed", async () => {
            diagram = await createTestDiagram();
            // A fresh canvas has no icon set: the export configuration is built
            // only once both dictionaries are non-empty.
            expect(diagram.client.getIcons()).toEqual({
                actors: {},
                workObjects: {},
            });

            const iconsChanged = vi.fn();
            diagram.client.on("icons.changed", iconsChanged);
            diagram.client.loadIcons(TEST_ICON_SET);

            expect(Object.keys(diagram.client.getIcons().actors)).toEqual(
                Object.keys(TEST_ACTOR_ICONS),
            );
            expect(
                diagram.client.hasIcon("actor", TEST_ICON_NAMES.person),
            ).toBe(true);
            expect(
                diagram.client.hasIcon("workObject", TEST_ICON_NAMES.document),
            ).toBe(true);
            expect(diagram.client.hasIcon("actor", "NotLoaded")).toBe(false);

            await vi.waitFor(() =>
                expect(iconsChanged).toHaveBeenCalledTimes(1),
            );
            expect(iconsChanged).toHaveBeenCalledWith(
                diagram.client.getIcons(),
            );
        });

        it("addIcon registers an icon and a CSS rule; removeIcon takes it back out", async () => {
            diagram = await createTestDiagram();
            diagram.client.loadIcons(TEST_ICON_SET);
            const rulesBefore = iconRules(diagram.container).length;

            diagram.client.addIcon(
                "actor",
                "Robot",
                '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">' +
                    '<rect x="4" y="4" width="16" height="16" fill="#333"/></svg>',
            );

            expect(diagram.client.hasIcon("actor", "Robot")).toBe(true);
            expect(diagram.client.getIcons().actors["Robot"]).toContain("<svg");
            // The renderer paints icons through a mask-image rule, so the icon is
            // only usable once IconCssInjector published one for it.
            expect(iconRules(diagram.container).length).toBe(rulesBefore + 1);

            diagram.client.removeIcon("actor", "Robot");

            expect(diagram.client.hasIcon("actor", "Robot")).toBe(false);
            expect(diagram.client.getIcons().actors["Robot"]).toBeUndefined();
            // The icons already in the set are untouched by the removal.
            expect(
                diagram.client.hasIcon("actor", TEST_ICON_NAMES.person),
            ).toBe(true);
        });

        it("replaces shared artwork immediately for existing and new shapes without crossing clients", async () => {
            const primaryProbe = iconRefreshProbe();
            const isolatedProbe = iconRefreshProbe();
            const reopenedProbe = iconRefreshProbe();
            diagram = await createTestDiagram({}, [primaryProbe.module]);
            const isolated = await createTestDiagram({}, [
                isolatedProbe.module,
            ]);
            let reopened: TestDiagram | undefined;

            try {
                diagram.client.import(sharedNestedIconStory());
                isolated.client.import(sharedNestedIconStory());
                const businessObjectsBefore = JSON.stringify(
                    diagram.client.export().domainStory.businessObjects,
                );
                expect(primaryProbe.commandStack().canUndo()).toBe(false);

                const rectangle =
                    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" data-revision="rectangle" onload="unsafe()">' +
                    '<script>unsafe()</script><rect x="2" y="2" width="20" height="20"/></svg>';
                diagram.client.addIcon("actor", "Shared", rectangle);

                // Repaint is synchronous: no timer/import is awaited between
                // addIcon() and reading geometry from both nested categories.
                expect(renderedArtwork(diagram.container, "nested_actor")).toBe(
                    "rect",
                );
                expect(
                    renderedArtwork(diagram.container, "nested_work_object"),
                ).toBe("rect");
                expect(
                    JSON.stringify(
                        diagram.client.export().domainStory.businessObjects,
                    ),
                ).toBe(businessObjectsBefore);
                expect(primaryProbe.commandStack().canUndo()).toBe(false);

                const rectangleActor = primaryProbe.create("actor", "Shared");
                const rectangleObject = primaryProbe.create(
                    "workObject",
                    "Shared",
                );
                expect(
                    renderedArtwork(diagram.container, rectangleActor.id),
                ).toBe("rect");
                expect(
                    renderedArtwork(diagram.container, rectangleObject.id),
                ).toBe("rect");

                diagram.client.removeIcon("actor", "Shared");
                expect(diagram.client.hasIcon("actor", "Shared")).toBe(false);
                expect(diagram.client.hasIcon("workObject", "Shared")).toBe(
                    true,
                );
                const storyBeforeReAdd = JSON.stringify(
                    diagram.client.export().domainStory.businessObjects,
                );
                const triangle =
                    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" data-revision="triangle">' +
                    '<polygon points="12,2 22,22 2,22" onclick="unsafe()"/></svg>';
                diagram.client.addIcon("actor", "Shared", triangle);

                for (const id of [
                    "nested_actor",
                    "nested_work_object",
                    rectangleActor.id,
                    rectangleObject.id,
                ]) {
                    expect(renderedArtwork(diagram.container, id)).toBe(
                        "polygon",
                    );
                }
                expect(
                    JSON.stringify(
                        diagram.client.export().domainStory.businessObjects,
                    ),
                ).toBe(storyBeforeReAdd);

                const triangleActor = primaryProbe.create("actor", "Shared");
                const triangleObject = primaryProbe.create(
                    "workObject",
                    "Shared",
                );
                expect(
                    renderedArtwork(diagram.container, triangleActor.id),
                ).toBe("polygon");
                expect(
                    renderedArtwork(diagram.container, triangleObject.id),
                ).toBe("polygon");

                const latest = diagram.client.getIcons().actors["Shared"];
                expect(latest).toContain('data-revision="triangle"');
                expect(latest).not.toContain("onclick");
                expect(diagram.client.getIcons().workObjects["Shared"]).toBe(
                    latest,
                );
                expect(primaryProbe.dictionary().getIconSource("Shared")).toBe(
                    latest,
                );
                expect(svgPublishedFor(diagram.container, "Shared")).toBe(
                    latest,
                );
                const sharedSelector = iconSelector(
                    diagram.container,
                    "Shared",
                );
                expect(
                    iconRules(diagram.container).filter(
                        (rule) => rule.selectorText === sharedSelector,
                    ),
                ).toHaveLength(1);

                const exported = diagram.client.export();
                expect(exported.iconSet.actors["Shared"]).toBe(latest);
                expect(exported.iconSet.workObjects["Shared"]).toBe(latest);

                // The second client's pool, selected maps, CSS, and existing
                // geometry stay on the source it imported.
                expect(
                    isolatedProbe.dictionary().getIconSource("Shared"),
                ).toContain('data-revision="circle"');
                expect(svgPublishedFor(isolated.container, "Shared")).toContain(
                    'data-revision="circle"',
                );
                expect(
                    renderedArtwork(isolated.container, "nested_actor"),
                ).toBe("circle");

                reopened = await createTestDiagram({}, [reopenedProbe.module]);
                reopened.client.import(exported);
                for (const id of [
                    "nested_actor",
                    "nested_work_object",
                    rectangleActor.id,
                    rectangleObject.id,
                    triangleActor.id,
                    triangleObject.id,
                ]) {
                    expect(renderedArtwork(reopened.container, id)).toBe(
                        "polygon",
                    );
                }
                expect(reopenedProbe.dictionary().getIconSource("Shared")).toBe(
                    latest,
                );
            } finally {
                reopened?.cleanup();
                isolated.cleanup();
            }
        });

        it("keeps unrelated icons when removing a work object", async () => {
            diagram = await createTestDiagram();
            diagram.client.loadIcons(TEST_ICON_SET);

            diagram.client.removeIcon("workObject", TEST_ICON_NAMES.folder);

            expect(
                diagram.client.hasIcon("workObject", TEST_ICON_NAMES.folder),
            ).toBe(false);
            expect(
                diagram.client.hasIcon("workObject", TEST_ICON_NAMES.document),
            ).toBe(true);
        });

        it("re-imports changed SVGs under the same actor and work-object names", async () => {
            diagram = await createTestDiagram();
            diagram.client.import(storyWithIconVersion("A"));

            expect(renderedIconVersion(diagram.container, "shape_actor")).toBe(
                "A",
            );
            expect(
                renderedIconVersion(diagram.container, "shape_workobject"),
            ).toBe("A");
            expect(
                svgPublishedFor(diagram.container, TEST_ICON_NAMES.person),
            ).toContain('data-version="A"');
            expect(
                svgPublishedFor(diagram.container, TEST_ICON_NAMES.document),
            ).toContain('data-version="A"');

            diagram.client.import(storyWithIconVersion("B"));

            expect(renderedIconVersion(diagram.container, "shape_actor")).toBe(
                "B",
            );
            expect(
                renderedIconVersion(diagram.container, "shape_workobject"),
            ).toBe("B");
            expect(
                svgPublishedFor(diagram.container, TEST_ICON_NAMES.person),
            ).toContain('data-version="B"');
            expect(
                svgPublishedFor(diagram.container, TEST_ICON_NAMES.document),
            ).toContain('data-version="B"');
            expect(
                iconRules(diagram.container).filter(
                    (rule) =>
                        rule.selectorText ===
                            iconSelector(
                                diagram!.container,
                                TEST_ICON_NAMES.person,
                            ) ||
                        rule.selectorText ===
                            iconSelector(
                                diagram!.container,
                                TEST_ICON_NAMES.document,
                            ),
                ),
            ).toHaveLength(2);
        });

        it("activates icon rules loaded before the host is attached", async () => {
            const container = document.createElement("div");
            container.style.width = "800px";
            container.style.height = "600px";
            const client = await EgonClient.create({ container });
            diagram = {
                client,
                container,
                cleanup: () => {
                    client.destroy();
                    container.remove();
                },
            };

            client.loadIcons(TEST_ICON_SET);
            const style = container.querySelector<HTMLStyleElement>(
                "[data-egon-icons-css]",
            )!;
            expect(style.sheet).toBeNull();

            document.body.appendChild(container);

            expect(iconRules(container).length).toBe(
                Object.keys(TEST_ACTOR_ICONS).length +
                    Object.keys(TEST_WORK_OBJECT_ICONS).length,
            );
            expect(svgPublishedFor(container, TEST_ICON_NAMES.person)).toBe(
                TEST_ACTOR_ICONS[TEST_ICON_NAMES.person],
            );
        });

        it.each([
            {
                name: "removeIcon",
                apply(client: EgonClient) {
                    client.removeIcon("actor", "Person");
                    client.removeIcon("workObject", "Document");
                },
            },
            {
                name: "replacement loadIcons",
                apply(client: EgonClient) {
                    client.loadIcons({
                        name: "replacement",
                        actors: { Other: '<svg data-artwork="other"/>' },
                        workObjects: {},
                    });
                },
            },
            {
                name: "empty loadIcons",
                apply(client: EgonClient) {
                    client.loadIcons({});
                },
            },
        ])(
            "retains nested live icon artwork after $name and a fresh-client import",
            async ({ apply }) => {
                diagram = await createTestDiagram();
                diagram.client.import(nestedIconStory());
                const iconsChanged = vi.fn();
                diagram.client.on("icons.changed", iconsChanged);

                apply(diagram.client);
                await vi.waitFor(() =>
                    expect(iconsChanged).toHaveBeenCalledTimes(1),
                );

                // The creation selection remains exactly what the caller chose;
                // exporting must not smuggle retained assets back into it.
                expect(diagram.client.hasIcon("actor", "Person")).toBe(false);
                expect(diagram.client.hasIcon("workObject", "Document")).toBe(
                    false,
                );

                const exported = diagram.client.export();
                await settle();
                expect(iconsChanged).toHaveBeenCalledTimes(1);
                expect(exported.iconSet.actors["Person"]).toContain(
                    'data-artwork="actor"',
                );
                expect(exported.iconSet.workObjects["Document"]).toContain(
                    'data-artwork="work-object"',
                );

                diagram.cleanup();
                diagram = await createTestDiagram();
                diagram.client.import(exported);

                expect(svgPublishedFor(diagram.container, "Person")).toContain(
                    'data-artwork="actor"',
                );
                expect(
                    svgPublishedFor(diagram.container, "Document"),
                ).toContain('data-artwork="work-object"');
                const imported = diagram.client.export().domainStory
                    .businessObjects as any[];
                expect(
                    Object.fromEntries(
                        imported.map((element) => [element.id, element.type]),
                    ),
                ).toMatchObject({
                    nested_actor: ElementTypes.ACTOR + "Person",
                    nested_work_object: ElementTypes.WORKOBJECT + "Document",
                });
                expect(
                    Object.fromEntries(
                        imported.map((element) => [element.id, element.parent]),
                    ),
                ).toMatchObject({
                    group_inner: "group_outer",
                    nested_actor: "group_inner",
                    nested_work_object: "group_inner",
                });
            },
        );
    });

    describe("destroy", () => {
        /** Each case destroys the client itself; `afterEach` removes only the node. */
        function ownDestroy(current: TestDiagram): TestDiagram {
            return { ...current, cleanup: () => current.container.remove() };
        }

        it("empties the host container and delivers no further events", async () => {
            diagram = await createTestDiagram();
            const { client, container } = diagram;
            client.import(storyAt({ x: -400, y: -300 }));
            expect(container.querySelector("svg")).not.toBeNull();

            const storyChanged = vi.fn();
            const viewportChanged = vi.fn();
            client.on("story.changed", storyChanged);
            client.on("viewport.changed", viewportChanged);

            diagram = ownDestroy(diagram);
            client.destroy();

            // Emptiness, not "no .djs-container": diagram-js removes only its
            // own node, so the adapter must remove its icon `<style>` itself.
            expect(container.children.length).toBe(0);
            expect(container.querySelector("svg")).toBeNull();

            await settle();

            expect(storyChanged).not.toHaveBeenCalled();
            expect(viewportChanged).not.toHaveBeenCalled();
        });

        it("cancels a story callback that was in flight at destroy() time", async () => {
            diagram = await createTestDiagram();
            const { client } = diagram;
            client.import(storyAt({ x: -400, y: -300 }));

            const storyChanged = vi.fn();
            client.on("story.changed", storyChanged);

            // Destroyed inside the debounce window, with a timer already armed.
            diagram = ownDestroy(diagram);
            client.alignToOrigin();
            client.destroy();
            await settle();

            expect(storyChanged).not.toHaveBeenCalled();
        });

        it("cancels an icons callback that was in flight at destroy() time", async () => {
            diagram = await createTestDiagram();
            const { client } = diagram;

            const iconsChanged = vi.fn();
            client.on("icons.changed", iconsChanged);

            // `loadIcons` always arms the timer, so this proves destroy() reaches
            // the icon port, whose callback would read a torn-down injector.
            diagram = ownDestroy(diagram);
            client.loadIcons(TEST_ICON_SET);
            client.destroy();
            await settle();

            expect(iconsChanged).not.toHaveBeenCalled();
        });
    });
});
