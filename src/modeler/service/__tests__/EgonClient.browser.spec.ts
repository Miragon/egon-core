import { afterEach, describe, expect, it, vi } from "vitest";
import type CommandStack from "diagram-js/lib/command/CommandStack";
import type EventBus from "diagram-js/lib/core/EventBus";
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

/**
 * The other half of `EgonClient.spec.ts`: the same public API, but wired to the
 * real `DiagramJsModelerAdapter` and `DiagramJsIconAdapter`.
 *
 * WHY it exists next to the mocked-port spec: that spec proves routing only —
 * every case asserts "the port method was called". It therefore cannot see the
 * behaviour hosts actually depend on: that `story.changed` arrives *once* and
 * only after the adapters' 100 ms debounce, that a viewport round-trips through
 * diagram-js' viewbox maths, that `alignToOrigin` really shifts elements and
 * stays undoable, or that the icon API reaches the live icon dictionary. Those
 * are the seams an upstream sync breaks silently.
 *
 * WHY browser tier (ADR 0014): every case here reaches `canvas.addShape` via
 * `import()`, which needs `SVGSVGElement.createSVGTransform`; and viewbox maths
 * needs a real `getBBox` and a non-zero `viewbox().outer` — in jsdom the outer
 * box is `{0,0}`, so `fitToScreen()` yields NaN.
 */

/** The adapters debounce host callbacks by this much before delivering them. */
const DEBOUNCE_MS = 100;

/**
 * Waits long enough that a debounced callback *must* have been delivered.
 *
 * Real timers, not `vi.useFakeTimers()`: this tier drives a real canvas whose
 * rendering and scroll compensation are browser-scheduled, and freezing the
 * clock would stall them alongside the debounce.
 */
function settle(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, DEBOUNCE_MS * 2.5));
}

/**
 * The two halves of the shared icon set, narrowed once.
 *
 * `IconSetData` marks both maps optional (icon-only callers may send just one),
 * while a document's `iconSet` and `Object.keys` want them present — so the
 * fallback lives here rather than at four call sites.
 */
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
 * A minimal EGN v4 story, placed wherever a case needs it.
 *
 * Hand-built rather than taken from `importFixture`: the alignment cases need
 * *negative* coordinates (the shipped fixtures start at x >= 100, and
 * align-to-origin ignores adjustments below its 50 px tolerance), and explicit
 * width/height so the enclosure assertions do not depend on the element
 * factory's defaults reaching the business object.
 *
 * Its `iconSet` is TEST_ICON_SET because import loads the document's own icons,
 * and an actor whose icon is missing throws inside the renderer.
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
 * `storyAt`, plus an activity whose target does not exist in the file.
 *
 * That is the damage `pruneUnreferencedConnections` repairs on import: the edge
 * cannot be added (its endpoint is not in the registry), so it is dropped and
 * the story loads without it. It is also the only way to make `import.repaired`
 * fire through the public API.
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

function svgPublishedFor(container: HTMLElement, iconName: string): string {
    const rule = iconRules(container).find(
        (candidate) =>
            candidate.selectorText ===
            `.icon-domain-story-${iconName}::before`.toLowerCase(),
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
 * Halves the visible area while keeping the canvas' aspect ratio.
 *
 * Aspect matters: diagram-js' viewbox setter re-derives the scale as
 * `min(outer.width / box.width, outer.height / box.height)` and re-centres the
 * result, so only an aspect-preserving box round-trips unchanged. Deriving it
 * from the current viewport keeps the case independent of the container size.
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
 * Reaches the diagram's own commandStack through `additionalModules`.
 *
 * `EgonClient` exposes no undo — hosts drive it via keyboard or their own editor
 * actions — so this is the only way to prove that `alignToOrigin()`, called on
 * the public API, produced a *revertible* command rather than an in-place edit.
 * `additionalModules` is the supported extension point, so the probe rides the
 * production boot instead of a second diagram.
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
 * Reaches the diagram's own eventBus through `additionalModules`.
 *
 * Needed because no *public* call produces an event burst: `alignToOrigin()`
 * emits exactly one `commandStack.changed`, so it cannot tell a working
 * debounce from a broken one. Firing the raw event is the only way to prove
 * coalescing end-to-end, and it rides the production boot like the commandStack
 * probe does.
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
            // Import runs through canvas.addShape, not the commandStack, so it
            // raises no story.changed of its own — the align below is the only
            // command in this case.
            diagram.client.import(storyAt({ x: -400, y: -300 }));

            const storyChanged = vi.fn();
            diagram.client.on("story.changed", storyChanged);
            diagram.client.alignToOrigin();

            expect(storyChanged).not.toHaveBeenCalled();

            await vi.waitFor(() =>
                expect(storyChanged).toHaveBeenCalledTimes(1),
            );
            await settle();

            // Still one — align raises exactly one commandStack.changed, so
            // this pins delivery-once, not coalescing. The burst case below is
            // what actually exercises the debounce.
            expect(storyChanged).toHaveBeenCalledTimes(1);
        });

        it("collapses a burst of diagram events into one callback", async () => {
            const probe = eventBusProbe();
            diagram = await createTestDiagram({}, [probe.module]);

            const storyChanged = vi.fn();
            diagram.client.on("story.changed", storyChanged);

            // Fired directly rather than through the public API: no public call
            // emits more than one commandStack.changed, so a real burst is the
            // only thing that can distinguish a debounce that coalesces from one
            // that merely delays (the pre-#69 behaviour delivered 5).
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

            // No `waitFor`: unlike the debounced events above, this one has to
            // have arrived by the time `import()` returns, or a host cannot warn
            // before it lets the user save the repaired story back over the file.
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
                            `.icon-domain-story-${TEST_ICON_NAMES.person}::before`.toLowerCase() ||
                        rule.selectorText ===
                            `.icon-domain-story-${TEST_ICON_NAMES.document}::before`.toLowerCase(),
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
    });

    describe("destroy", () => {
        /**
         * Hands teardown only the DOM node, because each case below destroys the
         * client itself — otherwise `afterEach` would destroy it twice.
         */
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

            // `children.length === 0`, not "no .djs-container": diagram-js
            // removes only its own node, so the adapter must take its icon
            // `<style>` back out itself. Asserting emptiness rather than the
            // marker keeps this case honest if the marker is ever renamed.
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

            // Destroyed inside the debounce window, with a timer already armed —
            // the case the old teardown could not cover, because the pending
            // timeout was closure-private and nothing could clear it.
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

            // `loadIcons` fires dst.config.changed unconditionally, so the timer
            // is certainly armed. This is the case that proves EgonClient.destroy()
            // reaches the *icon* port — whose callback would otherwise read
            // services off the injector the modeler port has just torn down.
            diagram = ownDestroy(diagram);
            client.loadIcons(TEST_ICON_SET);
            client.destroy();
            await settle();

            expect(iconsChanged).not.toHaveBeenCalled();
        });
    });
});
