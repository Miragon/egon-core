import { afterEach, describe, expect, it } from "vitest";
import type { ModuleDeclaration } from "didi";
import type EventBus from "diagram-js/lib/core/EventBus";
import type ElementRegistry from "diagram-js/lib/core/ElementRegistry";
import type { Connection, Element } from "diagram-js/lib/model/Types";

import {
    createTestDiagram,
    type TestDiagram,
} from "../../../../__tests__/helpers/createTestDiagram";
import {
    createTestModeler,
    type TestModeler,
} from "../../../../__tests__/helpers/createTestModeler";
import {
    addActor,
    addAnnotation,
    addWorkObject,
    connect,
} from "../../../../__tests__/helpers/storyBuilder";
import { importFixture } from "../../../../__tests__/helpers/importFixture";
import type { DomainStoryDocument } from "../../../../story/domain/DomainStoryDocument";
import type { DirtyFlagService } from "../../../service/DirtyFlagService";

/**
 * Drawing must not change the persisted model (ADR ARC-4). On the import path
 * `element.waypoints` is `businessObject.waypoints`, so an in-place write during
 * a repaint lands in the saved file; hence `createTestDiagram`, not the modeler.
 *
 * Browser tier (ADRs TST-1/TST-2): the nudge is measured from the rendered
 * label's `<tspan>` and read back with `getPointAtLength`; jsdom has neither.
 */

/** The activity whose start point sits over its source actor's label. */
const NUDGED_ACTIVITY = "connection_8174";

/** The actor whose label that start point has to clear. */
const NUDGED_SOURCE = "shape_2543";

/** An activity of the same source that stays above the `source.y + 60` guard. */
const UNNUDGED_ACTIVITY = "connection_5930";

/**
 * Captures `eventBus` and `elementRegistry` via `additionalModules`, since
 * `EgonClient` exposes neither.
 */
function injectorProbe(): {
    module: ModuleDeclaration;
    eventBus(): EventBus;
    elementRegistry(): ElementRegistry;
} {
    let capturedEventBus: EventBus | undefined;
    let capturedElementRegistry: ElementRegistry | undefined;

    function capture(
        eventBus: EventBus,
        elementRegistry: ElementRegistry,
    ): void {
        capturedEventBus = eventBus;
        capturedElementRegistry = elementRegistry;
    }
    capture.$inject = ["eventBus", "elementRegistry"];

    function required<T>(value: T | undefined, name: string): T {
        if (!value) {
            throw new Error(`${name} was never injected`);
        }
        return value;
    }

    return {
        module: { __init__: [capture] },
        eventBus: () => required(capturedEventBus, "eventBus"),
        elementRegistry: () =>
            required(capturedElementRegistry, "elementRegistry"),
    };
}

/** v1.x stores the story as a JSON string under `dst`, so edits must re-serialize it. */
function editLegacyStory(fixture: any, edit: (elements: any[]) => void): any {
    const elements = JSON.parse(fixture.dst);
    edit(elements);
    fixture.dst = JSON.stringify(elements);
    return fixture;
}

function businessObject(elements: any[], id: string): any {
    const found = elements.find((element) => element.id === id);
    if (!found) {
        throw new Error(`fixture carries no element ${id}`);
    }
    return found;
}

function visualOf(container: HTMLElement, id: string): SVGElement {
    const visual = container.querySelector(
        `[data-element-id="${id}"] .djs-visual`,
    );
    if (!visual) {
        throw new Error(`${id} was never rendered`);
    }
    return visual as SVGElement;
}

/** `drawActivity` appends the line first, so it is the visual's first child. */
function drawnLine(container: HTMLElement, id: string): SVGGeometryElement {
    return visualOf(container, id).firstElementChild as SVGGeometryElement;
}

/** `DEFAULT_COLOR` as `getComputedStyle` reports it: tiny-svg puts `stroke` in the style, which normalizes hex to `rgb()`. */
const DEFAULT_COLOR_COMPUTED = "rgb(0, 0, 0)";

function markerIdOf(line: SVGElement): string {
    const reference = getComputedStyle(line).markerEnd;
    const id = /#([^"')]+)/.exec(reference);
    if (!id) {
        throw new Error(`the drawn line has no marker-end: ${reference}`);
    }
    return id[1];
}

/** Plain `{x, y}` so a measurement survives the diagram's cleanup. */
function xy(point: DOMPoint): { x: number; y: number } {
    return { x: point.x, y: point.y };
}

/** `setCoordinates` writes absolute positions onto the `<tspan>`s, not the `<text>`. */
function firstTspanPosition(
    visual: SVGElement,
    selector: string,
): { x: string | null; y: string | null } {
    const tspan = visual.querySelector(`${selector} tspan`);
    if (!tspan) {
        throw new Error(`no ${selector} was rendered`);
    }
    return { x: tspan.getAttribute("x"), y: tspan.getAttribute("y") };
}

/**
 * Whole business objects, so any new renderer write is caught. `JSON.stringify`
 * because `structuredClone` rejects the `get`/`set` functions the factory attaches.
 */
function snapshotBusinessObjects(
    elementRegistry: ElementRegistry,
): Record<string, string> {
    const snapshot: Record<string, string> = {};
    for (const element of elementRegistry.getAll()) {
        if (!element.businessObject) continue;
        snapshot[element.id] = JSON.stringify(element.businessObject);
    }
    return snapshot;
}

/** Above the renderer's 2000: its `render.*` handler returns a value, which stops propagation. */
const ABOVE_RENDERER = 3000;

/** Repaints `element` and proves it repainted, so purity assertions cannot pass vacuously. */
function forceRender(eventBus: EventBus, element: Element): void {
    let renders = 0;
    const countRender = () => {
        renders += 1;
    };

    // Block body, so it returns undefined and does not itself stop propagation.
    eventBus.on(
        ["render.shape", "render.connection"],
        ABOVE_RENDERER,
        countRender,
    );
    try {
        eventBus.fire("element.changed", { element });
    } finally {
        eventBus.off(["render.shape", "render.connection"], countRender);
    }

    expect(
        renders,
        "element.changed did not repaint — every purity assertion after this would be vacuous",
    ).toBeGreaterThan(0);
}

describe("renderer model purity (browser)", () => {
    let diagram: TestDiagram | undefined;
    let probe: ReturnType<typeof injectorProbe>;

    // Leaked canvases make this tier slow. Guarded because a failed boot leaves it unset.
    afterEach(() => {
        diagram?.cleanup();
        diagram = undefined;
    });

    async function importIntoFreshDiagram(fixture: any): Promise<TestDiagram> {
        probe = injectorProbe();
        const booted = await createTestDiagram({}, [probe.module]);
        booted.client.import(fixture as DomainStoryDocument);
        return booted;
    }

    describe("the model survives a render pass", () => {
        it("leaves every business object byte-identical while repainting", async () => {
            diagram = await importIntoFreshDiagram(
                importFixture("dst_export_version_1_1_0.json"),
            );
            const elementRegistry = probe.elementRegistry();
            const connection = elementRegistry.get(
                NUDGED_ACTIVITY,
            ) as Connection;

            // Preconditions: the persisted point is untouched, and the element
            // still shares the business object's array.
            expect(connection.businessObject.waypoints[0]).toEqual({
                x: 185,
                y: 172,
                original: { x: 185, y: 167 },
            });
            expect(connection.waypoints).toBe(
                connection.businessObject.waypoints,
            );

            const before = snapshotBusinessObjects(elementRegistry);
            forceRender(probe.eventBus(), connection);

            expect(snapshotBusinessObjects(elementRegistry)).toEqual(before);
        });
    });

    /** States no fixture contains, so the byte-comparison above cannot reach them. */
    describe("nothing else survives a repaint", () => {
        let modeler: TestModeler | undefined;

        afterEach(() => {
            modeler?.cleanup();
            modeler = undefined;
        });

        it("gains no `number` on an annotation, and keeps its height", () => {
            modeler = createTestModeler();
            const annotation = addAnnotation(modeler, {
                point: { x: 200, y: 200 },
                width: 100,
                height: 80,
            });
            annotation.businessObject.text = "a note";

            forceRender(modeler.eventBus, annotation);

            expect("number" in annotation.businessObject).toBe(false);
            expect(annotation.height).toBe(80);
        });

        it("leaves a stale number on a work-object-sourced activity alone", () => {
            modeler = createTestModeler();
            const workObject = addWorkObject(modeler, {
                point: { x: 200, y: 200 },
            });
            const other = addWorkObject(modeler, { point: { x: 500, y: 200 } });
            const response = connect(modeler, workObject, other)!;
            // A number this activity should not carry, as a hand-edited file might.
            response.businessObject.number = 9;

            forceRender(modeler.eventBus, response);

            expect(response.businessObject.number).toBe(9);
        });

        it("does not report unsaved changes", () => {
            modeler = createTestModeler();
            const actor = addActor(modeler, { point: { x: 200, y: 200 } });
            const dirtyFlagService = modeler.get<DirtyFlagService>(
                "domainStoryDirtyFlagService",
            );
            // `clear()`, not `undo()`: undo would remove the actor and leave
            // nothing to repaint.
            modeler.commandStack.clear();
            expect(dirtyFlagService.dirty).toBe(false);

            forceRender(modeler.eventBus, actor);

            expect(dirtyFlagService.dirty).toBe(false);
        });
    });

    describe("the nudge still reaches the drawn line", () => {
        it("draws the start point clear of the source's label", async () => {
            diagram = await importIntoFreshDiagram(
                importFixture("dst_export_version_1_1_0.json"),
            );
            const model = (
                probe.elementRegistry().get(NUDGED_ACTIVITY) as Connection
            ).businessObject.waypoints;

            const line = drawnLine(diagram.container, NUDGED_ACTIVITY);
            const start = line.getPointAtLength(0);
            const end = line.getPointAtLength(line.getTotalLength());

            // One label line puts the last tspan at y=75: offset 75 - 70 = 5.
            // Only the start overlaps.
            expect(start.y).toBeCloseTo(model[0].y + 5, 3);
            expect(start.x).toBeCloseTo(model[0].x, 3);
            expect(end.y).toBeCloseTo(model[1].y, 3);
            expect(end.x).toBeCloseTo(model[1].x, 3);
        });

        it("draws an activity that clears the label already at its own start point", async () => {
            diagram = await importIntoFreshDiagram(
                importFixture("dst_export_version_1_1_0.json"),
            );
            const model = (
                probe.elementRegistry().get(UNNUDGED_ACTIVITY) as Connection
            ).businessObject.waypoints;

            // Control: the start sits above `source.y + 60`, so nothing is nudged.
            const start = drawnLine(
                diagram.container,
                UNNUDGED_ACTIVITY,
            ).getPointAtLength(0);

            expect(start.x).toBeCloseTo(model[0].x, 3);
            expect(start.y).toBeCloseTo(model[0].y, 3);
        });

        it("measures the offset off the source's label instead of assuming one line", async () => {
            // A two-line actor name pushes the last tspan from y=75 to y=89, so
            // the offset becomes 19 rather than 5. A hard-coded +5 fails here.
            diagram = await importIntoFreshDiagram(
                editLegacyStory(
                    importFixture("dst_export_version_1_1_0.json"),
                    (elements) => {
                        businessObject(elements, NUDGED_SOURCE).name =
                            "Anna\nSchmidt";
                    },
                ),
            );
            const model = (
                probe.elementRegistry().get(NUDGED_ACTIVITY) as Connection
            ).businessObject.waypoints;

            const start = drawnLine(
                diagram.container,
                NUDGED_ACTIVITY,
            ).getPointAtLength(0);

            expect(start.y).toBeCloseTo(model[0].y + 19, 3);
        });
    });

    describe("label and number follow the drawn line", () => {
        /** Every position the drawn activity is made of, as plain data. */
        async function measureDrawnActivity(fixture: any) {
            const local = await importIntoFreshDiagram(fixture);
            try {
                const visual = visualOf(local.container, NUDGED_ACTIVITY);
                const line = visual.firstElementChild as SVGGeometryElement;
                return {
                    lineStart: xy(line.getPointAtLength(0)),
                    label: firstTspanPosition(visual, "text.djs-label"),
                    number: firstTspanPosition(visual, "text.djs-labelNumber"),
                };
            } finally {
                local.cleanup();
            }
        }

        it("positions both from the nudged waypoints, not the element's own", async () => {
            // Label and number depend only on waypoints, so compare two diagrams
            // with the same drawn line instead of hand-writing coordinates:
            //   A: start persisted at 172, nudged to 177.
            //   B: start persisted at 177, source moved so nothing is nudged.
            const named = (elements: any[]) => {
                // An empty name draws no label.
                businessObject(elements, NUDGED_ACTIVITY).name = "picks up";
            };

            const a = await measureDrawnActivity(
                editLegacyStory(
                    importFixture("dst_export_version_1_1_0.json"),
                    named,
                ),
            );
            const b = await measureDrawnActivity(
                editLegacyStory(
                    importFixture("dst_export_version_1_1_0.json"),
                    (elements) => {
                        named(elements);
                        businessObject(
                            elements,
                            NUDGED_ACTIVITY,
                        ).waypoints[0].y = 177;
                        businessObject(elements, NUDGED_SOURCE).y = 300;
                    },
                ),
            );

            expect(a.lineStart).toEqual(b.lineStart);
            expect(a.label).toEqual(b.label);
            expect(a.number).toEqual(b.number);
        });
    });

    describe("a colourless story stays colourless", () => {
        it("neither stores nor exports a default pickedColor", async () => {
            // v1.0.0 is the only fixture with no `pickedColor` anywhere.
            diagram = await importIntoFreshDiagram(
                importFixture("dst_export_version_1_0_0.json"),
            );

            // The live model too: export's JSON would drop an `undefined` write.
            for (const element of probe.elementRegistry().getAll()) {
                if (!element.businessObject) continue;
                expect(
                    "pickedColor" in element.businessObject,
                    `${element.id} gained pickedColor from rendering`,
                ).toBe(false);
            }
            expect(JSON.stringify(diagram.client.export())).not.toContain(
                "pickedColor",
            );
        });

        it("still draws the group and the activity in the default colour", async () => {
            diagram = await importIntoFreshDiagram(
                importFixture("dst_export_version_1_0_0.json"),
            );
            const container = diagram.container;

            const groupRect = visualOf(container, "shape_1683").querySelector(
                "rect",
            )!;
            expect(getComputedStyle(groupRect).stroke).toBe(
                DEFAULT_COLOR_COMPUTED,
            );

            const line = drawnLine(container, UNNUDGED_ACTIVITY);
            expect(getComputedStyle(line).stroke).toBe(DEFAULT_COLOR_COMPUTED);

            // The marker id must stay a legal CSS identifier: `PreviewSupport`
            // runs `querySelector("marker#" + id)` on every activity drag.
            const markerId = markerIdOf(line);
            expect(markerId).not.toContain("#");
            expect(
                container.querySelector(`marker#${markerId}`),
            ).not.toBeNull();
        });
    });
});
