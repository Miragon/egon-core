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
 * Issues #65 and #74: drawing must not change the persisted model (ADR 0016).
 *
 * WHY this exists: `DomainStoryRenderer` used to write to the business objects
 * it was only asked to paint. For an *imported* story `element.waypoints` **is**
 * `businessObject.waypoints` (`DomainStoryImportService.addConnection` aliases
 * them and nothing on that path clones), so nudging an activity's start point
 * clear of its source's label persisted 5px into the saved file — and the next
 * open re-applied it. The fixture family records the creep: `connection_8174`'s
 * start `y` is 172 / 177 / 182 / 187 across v1.1.0→v1.4.0. The renderer also
 * stamped its default colour onto any element that carried none.
 *
 * #74 removed the five writes #65 left behind — the element type, the activity
 * number (minted *and* cleared), the annotation height, and the host's dirty
 * flag. The fixture-driven case above them passed **vacuously** for four of
 * those: no fixture carries an annotation, and every fixture activity already
 * holds exactly the number the renderer would have written. The cases in
 * "nothing else survives a repaint" build the states the fixtures cannot.
 *
 * WHY browser tier and not jsdom (ADR 0013/0014): the nudge is measured out of
 * the DOM — `getLineOffset` reads the source label's last `<tspan>`'s `y` — and
 * the drawn geometry is read back with `getPointAtLength`. jsdom has neither.
 *
 * WHY `createTestDiagram` and not `createTestModeler`: the aliasing only exists
 * on the **import** path. A command-created connection already gets a fresh
 * array from `DomainStoryUpdater.copyWaypoints`, which
 * `ActivityConnections.browser.spec.ts` asserts. The full boot also brings the
 * real default icon set, which these fixtures need.
 */

/** The activity whose start point sits over its source actor's label. */
const NUDGED_ACTIVITY = "connection_8174";

/** Its source: the actor whose label the start point has to clear. */
const NUDGED_SOURCE = "shape_2543";

/** An activity of the same source that stays above the `source.y + 60` guard. */
const UNNUDGED_ACTIVITY = "connection_5930";

/**
 * Reaches the booted diagram's own `eventBus` and `elementRegistry`.
 *
 * `EgonClient` exposes neither — hosts drive the canvas through the public API —
 * but forcing a repaint and snapshotting every business object both need the
 * live injector. `additionalModules` is the supported extension point, so the
 * probe rides the production boot instead of a second diagram. Kept local to
 * this file on purpose; it is a test seam, not shared infrastructure.
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

/**
 * Parses a v1.x fixture's story, hands the business objects to `edit`, and
 * writes them back.
 *
 * v1.x smuggled the whole story in as a JSON *string* under `dst`, so a fixture
 * cannot be tweaked by touching the parsed object — it has to be re-serialized
 * before the importer sees it.
 */
function editLegacyStory(fixture: any, edit: (elements: any[]) => void): any {
    const elements = JSON.parse(fixture.dst);
    edit(elements);
    fixture.dst = JSON.stringify(elements);
    return fixture;
}

/** The one business object with `id` out of a parsed legacy story. */
function businessObject(elements: any[], id: string): any {
    const found = elements.find((element) => element.id === id);
    if (!found) {
        throw new Error(`fixture carries no element ${id}`);
    }
    return found;
}

/** The `.djs-visual` group the renderer drew `id` into. */
function visualOf(container: HTMLElement, id: string): SVGElement {
    const visual = container.querySelector(
        `[data-element-id="${id}"] .djs-visual`,
    );
    if (!visual) {
        throw new Error(`${id} was never rendered`);
    }
    return visual as SVGElement;
}

/**
 * The activity's drawn line. `drawActivity` appends it before label and number,
 * so it is the visual's first child — read as geometry rather than by parsing
 * the `d` attribute, which would re-implement `createLine`.
 */
function drawnLine(container: HTMLElement, id: string): SVGGeometryElement {
    return visualOf(container, id).firstElementChild as SVGGeometryElement;
}

/**
 * `DEFAULT_COLOR` (`#000000`) as the browser reports it back.
 *
 * tiny-svg routes `stroke` into the inline *style*, not an attribute, and the
 * CSSOM normalizes a hex literal to `rgb()` — so the drawn colour has to be read
 * through `getComputedStyle`, and this is what it reads as.
 */
const DEFAULT_COLOR_COMPUTED = "rgb(0, 0, 0)";

/** The id of the arrowhead the drawn line references, out of `marker-end`. */
function markerIdOf(line: SVGElement): string {
    const reference = getComputedStyle(line).markerEnd;
    const id = /#([^"')]+)/.exec(reference);
    if (!id) {
        throw new Error(`the drawn line has no marker-end: ${reference}`);
    }
    return id[1];
}

/** Plain `{x, y}` so a measurement survives the diagram it was taken from. */
function xy(point: DOMPoint): { x: number; y: number } {
    return { x: point.x, y: point.y };
}

/**
 * Where a rendered label or number actually sits.
 *
 * `setCoordinates` rewrites the `<tspan>`s of an activity's texts to absolute
 * coordinates, so the first one carries the position — the enclosing `<text>`
 * does not.
 */
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
 * Every business object in the registry, as JSON.
 *
 * Snapshots the *whole* object rather than `waypoints`/`pickedColor` alone, so
 * the next renderer write is caught for free. `JSON.stringify` and not
 * `structuredClone`: `DomainStoryElementFactory` attaches `get`/`set`
 * **functions** to every business object, which `structuredClone` refuses to
 * clone. Stringifying also makes a newly *appended* key a difference, since key
 * order is insertion order.
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

/**
 * Priority above `DomainStoryRenderer`'s own 2000.
 *
 * Necessary, not defensive: the renderer's `render.*` handler *returns* the SVG
 * element it drew, and diagram-js' EventBus stops propagating as soon as a
 * listener returns a value — so a default-priority witness would never be
 * called and would report zero renders on a canvas that painted fine.
 */
const ABOVE_RENDERER = 3000;

/**
 * Repaints `element` and proves it repainted.
 *
 * The render witness is the point: without it a purity assertion passes
 * vacuously — and would have passed *before* the fix too, because nothing was
 * drawn. `element.changed` is the event production code already uses to force a
 * repaint (`DomainStoryPasteRestore`, `DomainStoryNumberingRegistry`), and
 * `render.connection` / `render.shape` are `BaseRenderer`'s own hooks.
 */
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

    // One diagram per case, torn down here: leaked canvases are what makes this
    // tier slow. Guarded because a failed boot leaves it unset.
    afterEach(() => {
        diagram?.cleanup();
        diagram = undefined;
    });

    /** Boots a diagram with the injector probe attached and imports `fixture`. */
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

            // Preconditions, so the case cannot go green for the wrong reason:
            // the first render already left the persisted point alone, and the
            // element still shares the business object's array — the aliasing
            // that made the old in-place nudge persist.
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

    /**
     * The four writes #74 removed that no fixture can reach.
     *
     * These drive a `createTestModeler` rather than an imported fixture: an
     * annotation, a work-object-sourced activity carrying a number, the dirty
     * flag and a paste are all states the eight historical files simply do not
     * contain — which is why the byte-comparison above went green while four
     * writes were still live.
     */
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

            // `drawAnnotation` used to mirror the height onto
            // `businessObject.number` — "the keyword height is not exported",
            // which stopped being true once the export pass wrote `height`
            // itself. The field is retired: an annotation has no number.
            expect("number" in annotation.businessObject).toBe(false);
            // …and the height it was mirroring survives the paint on its own.
            expect(annotation.height).toBe(80);
        });

        it("leaves a stale number on a work-object-sourced activity alone", () => {
            modeler = createTestModeler();
            const workObject = addWorkObject(modeler, {
                point: { x: 200, y: 200 },
            });
            const other = addWorkObject(modeler, { point: { x: 500, y: 200 } });
            const response = connect(modeler, workObject, other)!;
            // A number this activity has no business carrying — the shape a
            // hand-edited file or a future bug produces.
            response.businessObject.number = 9;

            forceRender(modeler.eventBus, response);

            // `renderExternalNumber` used to overwrite it with `null` on sight.
            // Silently correct-looking, and invisible to the fixture matrix only
            // because every fixture already stores `null` here.
            expect(response.businessObject.number).toBe(9);
        });

        it("does not report unsaved changes", () => {
            modeler = createTestModeler();
            const actor = addActor(modeler, { point: { x: 200, y: 200 } });
            const dirtyFlagService = modeler.get<DirtyFlagService>(
                "domainStoryDirtyFlagService",
            );
            // `clear()` rather than `undo()`: undoing `shape.create` removes the
            // actor, and `forceRender`'s witness would then correctly report zero
            // repaints and fail. Clearing empties the stack — the state a freshly
            // opened story is in — while leaving the shape on the canvas to paint.
            modeler.commandStack.clear();
            expect(dirtyFlagService.dirty).toBe(false);

            forceRender(modeler.eventBus, actor);

            // `drawShape`/`drawConnection` each called `makeDirty()`, so a
            // selection or a scroll-into-view reported unsaved changes.
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

            // One label line puts the source's last tspan at y=75, so the
            // offset is 75 - 70 = 5. Only the start overlaps; the end must not
            // move.
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

            // Control case: this activity's start sits above `source.y + 60`, so
            // the first guard rejects it and the drawn line is the model line.
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
            // The one case that cannot be asserted against a literal without
            // re-implementing `labelPosition` and `numberBoxDefinitions`. Both
            // depend *only* on the waypoints — never on the source shape — so
            // two diagrams are compared instead:
            //
            //   A: the fixture. Start persisted at 172, drawn at 177.
            //   B: start already at 177, and the source moved down so the
            //      `source.y + 60` guard fails and nothing is nudged.
            //
            // Same drawn line, therefore the same label and number. If either
            // consumer is ever handed `element.waypoints` again, A computes from
            // 172 and B from 177 and this goes red. No coordinate is hand-written.
            const named = (elements: any[]) => {
                // Fixture names are "" and `renderActivityLabel` draws nothing
                // for an empty name, so the label needs one to exist at all.
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

            // The *live* model, not just the export: export serializes through
            // JSON, which would drop an `undefined` and hide a write.
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

            // Both former writers stamped a default and then read it back, so
            // reading the constant directly has to render identically.
            const groupRect = visualOf(container, "shape_1683").querySelector(
                "rect",
            )!;
            expect(getComputedStyle(groupRect).stroke).toBe(
                DEFAULT_COLOR_COMPUTED,
            );

            const line = drawnLine(container, UNNUDGED_ACTIVITY);
            expect(getComputedStyle(line).stroke).toBe(DEFAULT_COLOR_COMPUTED);

            // The arrowhead must still resolve, and its id must stay a legal CSS
            // identifier: diagram-js' `PreviewSupport` clones a drag preview's
            // marker via `querySelector("marker#" + id)`, which throws outright
            // on the `#` of a colour literal. The default colour is `#000000`
            // since #65, so `markerId` folds it away — without that, every
            // activity drag would break.
            const markerId = markerIdOf(line);
            expect(markerId).not.toContain("#");
            expect(
                container.querySelector(`marker#${markerId}`),
            ).not.toBeNull();
        });
    });
});
