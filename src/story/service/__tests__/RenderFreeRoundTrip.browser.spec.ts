import { afterEach, describe, expect, it } from "vitest";
import type { ModuleDeclaration } from "didi";
import type ElementRegistry from "diagram-js/lib/core/ElementRegistry";

import {
    createTestDiagram,
    type TestDiagram,
} from "../../../__tests__/helpers/createTestDiagram";
import { importFixture } from "../../../__tests__/helpers/importFixture";
import type { DomainStoryDocument } from "../../domain/DomainStoryDocument";
import { ElementTypes } from "../../domain/elementTypes";

/**
 * What survives a save/open round trip now that drawing writes nothing (#74).
 *
 * WHY the matrix is not enough: `FormatCompatibilityMatrix.browser.spec.ts`
 * covers eight historical files byte-for-byte, but **none of them contains a
 * text annotation** and every activity in them already carries the number the
 * old renderer would have minted. So the two things #74 moved off the draw pass
 * — the annotation height and the activity sequence — are exactly the two the
 * matrix cannot see. These cases build those states instead of reading them.
 *
 * WHY browser tier (ADR 0014): both go through `client.import`, hence
 * `canvas.addShape`, hence `SVGSVGElement.createSVGTransform`.
 */

/**
 * Reaches the booted diagram's injector, which `EgonClient` deliberately hides.
 *
 * `additionalModules` is the supported extension point, so the probe rides the
 * production boot rather than a second diagram — the same seam
 * `RendererModelPurity.browser.spec.ts` uses. Kept local to this file: it is a
 * test seam, not shared infrastructure.
 */
function injectorProbe(): {
    module: ModuleDeclaration;
    elementRegistry(): ElementRegistry;
    modeling(): any;
    elementFactory(): any;
    commandStack(): any;
} {
    const captured: Record<string, unknown> = {};

    function capture(
        elementRegistry: ElementRegistry,
        modeling: unknown,
        elementFactory: unknown,
        commandStack: unknown,
    ): void {
        captured["elementRegistry"] = elementRegistry;
        captured["modeling"] = modeling;
        captured["elementFactory"] = elementFactory;
        captured["commandStack"] = commandStack;
    }
    capture.$inject = [
        "elementRegistry",
        "modeling",
        "elementFactory",
        "commandStack",
    ];

    const required = (name: string): any => {
        if (!captured[name]) {
            throw new Error(`${name} was never injected`);
        }
        return captured[name];
    };

    return {
        module: { __init__: [capture] },
        elementRegistry: () => required("elementRegistry"),
        modeling: () => required("modeling"),
        elementFactory: () => required("elementFactory"),
        commandStack: () => required("commandStack"),
    };
}

/** The one exported business object with `id`. */
function exported(story: any, id: string): any {
    const found = story.domainStory.businessObjects.find(
        (element: any) => element.id === id,
    );
    if (!found) {
        throw new Error(`the export carries no element ${id}`);
    }
    return found;
}

/** A deliberately unsorted nested-group document with every shape family. */
function storyWithGroupMembership(): DomainStoryDocument {
    return {
        // Reuse a complete icon set: imported actors and work objects render
        // through the production renderer during this browser-tier test.
        iconSet: importFixture<any>("egn_export_version_4_0_0.json").iconSet,
        domainStory: {
            version: "4.0.0",
            title: "group membership",
            description: "",
            businessObjects: [
                {
                    id: "shape_inner_group",
                    type: ElementTypes.GROUP,
                    name: "inner",
                    x: 100,
                    y: 100,
                    width: 300,
                    height: 200,
                    parent: "shape_outer_group",
                },
                {
                    id: "shape_actor",
                    type: `${ElementTypes.ACTOR}Person`,
                    name: "Alice",
                    x: 150,
                    y: 150,
                    parent: "shape_inner_group",
                },
                {
                    id: "shape_outer_group",
                    type: ElementTypes.GROUP,
                    name: "outer",
                    x: 50,
                    y: 50,
                    width: 500,
                    height: 400,
                },
                {
                    id: "shape_document",
                    type: `${ElementTypes.WORKOBJECT}Document`,
                    name: "Report",
                    x: 400,
                    y: 300,
                    parent: "shape_outer_group",
                },
                {
                    id: "shape_note",
                    type: ElementTypes.TEXTANNOTATION,
                    name: "",
                    text: "note",
                    x: 180,
                    y: 250,
                    width: 100,
                    height: 40,
                    parent: "shape_inner_group",
                },
                {
                    id: "shape_ungrouped",
                    type: `${ElementTypes.ACTOR}Group`,
                    name: "Outside",
                    x: 650,
                    y: 100,
                },
            ],
        },
    } as DomainStoryDocument;
}

describe("render-free round trip (browser)", () => {
    let diagram: TestDiagram | undefined;

    afterEach(() => {
        diagram?.cleanup();
        diagram = undefined;
    });

    describe("annotation height", () => {
        /**
         * A story with one sized text annotation, built through the *import*
         * path so no command is needed to place it.
         */
        function storyWithAnnotation(height: number, extra = {}) {
            return {
                domainStory: {
                    version: "4.0.0",
                    title: "",
                    description: "",
                    businessObjects: [
                        {
                            id: "shape_note",
                            type: ElementTypes.TEXTANNOTATION,
                            text: "a note",
                            name: "",
                            x: 100,
                            y: 100,
                            width: 100,
                            height,
                            ...extra,
                        },
                    ],
                },
                iconSet: { name: "default", actors: {}, workObjects: {} },
            };
        }

        it("keeps `height` and emits no `number` across open → save", async () => {
            diagram = await createTestDiagram();

            diagram.client.import(
                storyWithAnnotation(80) as unknown as DomainStoryDocument,
            );
            const story: any = diagram.client.export();

            const annotation = exported(story, "shape_note");
            expect(annotation.height).toBe(80);
            // The format narrows here: `drawAnnotation` used to mirror the
            // height onto `number` on every paint, so an exported annotation
            // carried a meaningless sequence number. Nothing writes it now.
            expect("number" in annotation).toBe(false);
        });

        it("survives a second round trip byte-identically", async () => {
            // The creep #65 was about: a per-paint write shows up as a *drift*
            // between two consecutive saves, not as a single wrong value.
            diagram = await createTestDiagram();

            diagram.client.import(
                storyWithAnnotation(80) as unknown as DomainStoryDocument,
            );
            const first = JSON.stringify(diagram.client.export());

            diagram.client.import(JSON.parse(first) as DomainStoryDocument);
            const second = JSON.stringify(diagram.client.export());

            expect(second).toBe(first);
        });

        it("reads a pre-#74 file's height out of its legacy `number`", async () => {
            // The one place allowed to know the old hack existed:
            // `useLegacyAnnotationNumberAsHeight`. Such a file has the height in
            // `number` and, because the export pass wrote it too, usually in
            // `height` as well — so the case that actually needs repairing is
            // the one where only `number` is present.
            diagram = await createTestDiagram();
            const legacy = storyWithAnnotation(0, { number: 65 });
            delete (legacy.domainStory.businessObjects[0] as any).height;

            diagram.client.import(legacy as unknown as DomainStoryDocument);
            const story: any = diagram.client.export();

            const annotation = exported(story, "shape_note");
            expect(annotation.height).toBe(65);
            expect("number" in annotation).toBe(false);
        });
    });

    describe("activity numbering", () => {
        it("does not renumber an imported story by opening it", async () => {
            // Numbering left the draw pass, so nothing runs on import except the
            // repair — and the repair must only fill gaps. The fixture's
            // sequence is 1/2/3 on the actor-sourced activities and `null` on
            // the responses; every one of those must come back untouched.
            const probe = injectorProbe();
            diagram = await createTestDiagram({}, [probe.module]);
            const fixture = importFixture<any>("egn_export_version_4_0_0.json");

            diagram.client.import(fixture as DomainStoryDocument);

            const numbers = Object.fromEntries(
                probe
                    .elementRegistry()
                    .getAll()
                    .filter((element) =>
                        (element["type"] ?? "").startsWith(
                            ElementTypes.ACTIVITY,
                        ),
                    )
                    .map((element) => [
                        element.id,
                        element.businessObject.number,
                    ]),
            );

            expect(numbers).toEqual({
                connection_5930: 1,
                connection_8174: 2,
                connection_6348: 3,
                connection_8014: null,
                connection_8064: null,
                connection_8994: null,
            });
        });

        it("completes a hand-made file's sequence on import, once", async () => {
            // The behaviour the repair preserves: before #74 a repaint minted
            // the missing number, so a hand-written file looked complete as soon
            // as it was drawn. It happens at import now — and the numbers the
            // file *does* carry are reserved, not reassigned.
            diagram = await createTestDiagram();
            // The real default icon set, off a fixture: an empty one leaves the
            // actor's icon unresolved and `svgCreate("")` throws before any
            // assertion is reached.
            const iconSet = importFixture<any>(
                "egn_export_version_4_0_0.json",
            ).iconSet;
            const handMade = {
                domainStory: {
                    version: "4.0.0",
                    title: "",
                    description: "",
                    businessObjects: [
                        {
                            id: "shape_actor",
                            type: `${ElementTypes.ACTOR}Person`,
                            name: "Anna",
                            x: 100,
                            y: 100,
                        },
                        {
                            id: "shape_doc",
                            type: `${ElementTypes.WORKOBJECT}Document`,
                            name: "form",
                            x: 400,
                            y: 100,
                        },
                        {
                            id: "connection_numbered",
                            type: ElementTypes.ACTIVITY,
                            name: "",
                            number: 2,
                            source: "shape_actor",
                            target: "shape_doc",
                            waypoints: [
                                { x: 137, y: 137 },
                                { x: 437, y: 137 },
                            ],
                        },
                        {
                            id: "connection_bare",
                            type: ElementTypes.ACTIVITY,
                            name: "",
                            source: "shape_actor",
                            target: "shape_doc",
                            waypoints: [
                                { x: 137, y: 150 },
                                { x: 437, y: 150 },
                            ],
                        },
                    ],
                },
                iconSet,
            };

            diagram.client.import(handMade as unknown as DomainStoryDocument);
            const story: any = diagram.client.export();

            // 2 is taken, so the gap at 1 is filled rather than the sequence
            // grown — `nextAvailableActivityNumber`'s rule, applied once.
            expect(exported(story, "connection_numbered").number).toBe(2);
            expect(exported(story, "connection_bare").number).toBe(1);
        });
    });
    describe("group membership", () => {
        it("preserves live relationships and exported parent ids across two open → save cycles", async () => {
            const probe = injectorProbe();
            diagram = await createTestDiagram({}, [probe.module]);

            diagram.client.import(storyWithGroupMembership());

            const registry = probe.elementRegistry();
            const outer = registry.get("shape_outer_group") as any;
            const inner = registry.get("shape_inner_group") as any;
            const actor = registry.get("shape_actor") as any;
            const document = registry.get("shape_document") as any;
            const note = registry.get("shape_note") as any;
            const ungrouped = registry.get("shape_ungrouped") as any;

            expect(inner.parent).toBe(outer);
            expect(actor.parent).toBe(inner);
            expect(document.parent).toBe(outer);
            expect(note.parent).toBe(inner);
            expect(ungrouped.parent).toBe(outer.parent);

            const first: any = diagram.client.export();
            expect(exported(first, "shape_inner_group").parent).toBe(
                "shape_outer_group",
            );
            expect(exported(first, "shape_actor").parent).toBe(
                "shape_inner_group",
            );
            expect(exported(first, "shape_document").parent).toBe(
                "shape_outer_group",
            );
            expect(exported(first, "shape_note").parent).toBe(
                "shape_inner_group",
            );
            expect(exported(first, "shape_ungrouped")).not.toHaveProperty(
                "parent",
            );
            expect(exported(first, "shape_outer_group")).not.toHaveProperty(
                "children",
            );

            diagram.client.import(first as DomainStoryDocument);
            const second = diagram.client.export();

            expect(second).toEqual(first);
            expect(
                probe.elementRegistry().get("shape_actor")!["parent"]!.id,
            ).toBe("shape_inner_group");
        });

        it("clears an imported child's exported parent when moved to the root and restores it on undo", async () => {
            const probe = injectorProbe();
            diagram = await createTestDiagram({}, [probe.module]);
            diagram.client.import(storyWithGroupMembership());

            const registry = probe.elementRegistry();
            const actor = registry.get("shape_actor") as any;
            const inner = registry.get("shape_inner_group") as any;
            const root = (registry.get("shape_outer_group") as any).parent;

            probe.modeling().moveElements([actor], { x: 0, y: 0 }, root);

            expect(actor.parent).toBe(root);
            expect(
                exported(diagram.client.export(), "shape_actor"),
            ).not.toHaveProperty("parent");

            probe.commandStack().undo();

            expect(actor.parent).toBe(inner);
            expect(
                exported(diagram.client.export(), "shape_actor").parent,
            ).toBe("shape_inner_group");
        });
    });
    /**
     * The whole lifecycle in one case, ending in a byte comparison.
     *
     * WHY it earns its place next to the focused cases above: each of those
     * pins one owner in isolation, and the failure mode #65/#74 are about is a
     * *drift* that only shows up when a story is edited, saved, opened and saved
     * again. Byte-identical is the bar; anything the draw pass writes shows up
     * here as a diff no matter which owner leaked it.
     */
    describe("a full editing session", () => {
        it("re-exports byte-identically after a save/open cycle", async () => {
            const probe = injectorProbe();
            diagram = await createTestDiagram({}, [probe.module]);
            // A real icon set: an unresolved actor icon makes `svgCreate("")`
            // throw long before anything is asserted.
            diagram.client.import(
                importFixture<any>(
                    "egn_export_version_4_0_0.json",
                ) as DomainStoryDocument,
            );
            const modeling = probe.modeling();
            const elementFactory = probe.elementFactory();
            const registry = probe.elementRegistry();

            const actor = registry.get("shape_2543") as any;
            const workObject = registry.get("shape_0798") as any;
            const otherWorkObject = registry.get("shape_5871") as any;

            // 1. A new story step off an actor is numbered by the command.
            const activity = modeling.connect(actor, workObject, {
                type: ElementTypes.ACTIVITY,
            });
            expect(activity.businessObject.number).toBe(4);

            // 2. Re-pointing its start away from the actor clears the number…
            modeling.reconnectStart(activity, otherWorkObject, {
                x: otherWorkObject.x + 37,
                y: otherWorkObject.y + 37,
            });
            expect(activity.businessObject.number).toBeNull();

            // 3. …and undo brings it back.
            probe.commandStack().undo();
            expect(activity.businessObject.number).toBe(4);

            // 4. An annotation, resized the way the label handler resizes one.
            const annotation = modeling.createShape(
                elementFactory.create("shape", {
                    type: ElementTypes.TEXTANNOTATION,
                    width: 100,
                    height: 30,
                }),
                { x: 700, y: 500 },
                registry.get(actor.parent.id),
            );
            annotation.businessObject.text = "a note";
            modeling.resizeShape(annotation, {
                x: annotation.x,
                y: annotation.y,
                width: 100,
                height: 120,
            });

            // 5. Save, open, save again.
            const first = JSON.stringify(diagram.client.export());
            diagram.client.import(JSON.parse(first) as DomainStoryDocument);
            const second = JSON.stringify(diagram.client.export());

            expect(second).toBe(first);
            // Not vacuous: the story really does contain the two things the
            // fixtures cannot, so a leak would have somewhere to show up.
            expect(first).toContain('"height":120');
            expect(first).toContain('"number":4');
        });
    });
});
