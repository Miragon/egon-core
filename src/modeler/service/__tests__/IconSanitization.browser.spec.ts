import { afterEach, describe, expect, it } from "vitest";
import type { ModuleDeclaration } from "didi";
import type Canvas from "diagram-js/lib/core/Canvas";
import type { Shape } from "diagram-js/lib/model/Types";

import {
    createTestDiagram,
    type TestDiagram,
} from "../../../__tests__/helpers/createTestDiagram";
import type { DomainStoryElementFactory } from "../../infrastructure/element-factory/DomainStoryElementFactory";
import type { DomainStoryModeling } from "../../infrastructure/modeling/DomainStoryModeling";
import type { IconDictionaryService } from "../../../iconSet/service";
import type { DomainStoryDocument } from "../../../story/domain/DomainStoryDocument";
import { ElementTypes } from "../../../story/domain/elementTypes";

const SVG_NS = "http://www.w3.org/2000/svg";
const EXECUTION_MARKER = "__egonIconExecuted";
const UNSAFE_SVG = `
    <svg xmlns="${SVG_NS}" viewBox="0 0 24 24" onload="window.${EXECUTION_MARKER}++">
      <script>window.${EXECUTION_MARKER}++</script>
      <foreignObject><div xmlns="http://www.w3.org/1999/xhtml">active html</div></foreignObject>
      <image href="missing.png" onerror="window.${EXECUTION_MARKER}++"/>
      <path d="M2 2h20v20H2z" fill="#123456" onclick="window.${EXECUTION_MARKER}++"/>
    </svg>
`;

interface CanvasProbe {
    module: ModuleDeclaration;
    create(
        category: "actor" | "workObject",
        icon: string,
        color?: string,
    ): Shape;
    dictionary(): IconDictionaryService;
}

function canvasProbe(): CanvasProbe {
    let canvas: Canvas | undefined;
    let factory: DomainStoryElementFactory | undefined;
    let modeling: DomainStoryModeling | undefined;
    let dictionary: IconDictionaryService | undefined;

    function capture(
        injectedCanvas: Canvas,
        injectedFactory: DomainStoryElementFactory,
        injectedModeling: DomainStoryModeling,
        injectedDictionary: IconDictionaryService,
    ): void {
        canvas = injectedCanvas;
        factory = injectedFactory;
        modeling = injectedModeling;
        dictionary = injectedDictionary;
    }
    capture.$inject = [
        "canvas",
        "elementFactory",
        "modeling",
        "domainStoryIconDictionaryService",
    ];

    return {
        module: { __init__: [capture] },
        create(category, icon, color) {
            if (!canvas || !factory || !modeling) {
                throw new Error("canvas probe was never injected");
            }
            const prefix =
                category === "actor"
                    ? ElementTypes.ACTOR
                    : ElementTypes.WORKOBJECT;
            const shape = factory.create("shape", { type: prefix + icon });
            if (color !== undefined) {
                shape.businessObject.pickedColor = color;
            }
            return modeling.createShape(
                shape,
                category === "actor" ? { x: 150, y: 150 } : { x: 350, y: 150 },
                canvas.getRootElement() as unknown as Shape,
            );
        },
        dictionary() {
            if (!dictionary) {
                throw new Error("icon dictionary was never injected");
            }
            return dictionary;
        },
    };
}

function storyWithIcons(
    actorIcon: string,
    workObjectIcon: string,
): DomainStoryDocument {
    return {
        iconSet: {
            name: "untrusted-icons",
            actors: { UnsafeActor: actorIcon },
            workObjects: { UnsafeObject: workObjectIcon },
        },
        domainStory: {
            title: "icon sanitization",
            description: "",
            version: "4.0.0",
            businessObjects: [
                {
                    id: "shape_actor",
                    type: ElementTypes.ACTOR + "UnsafeActor",
                    name: "actor",
                    x: 100,
                    y: 100,
                    width: 75,
                    height: 75,
                },
                {
                    id: "shape_object",
                    type: ElementTypes.WORKOBJECT + "UnsafeObject",
                    name: "object",
                    x: 300,
                    y: 100,
                    width: 75,
                    height: 75,
                },
            ],
        },
    };
}

function renderedIcons(diagram: TestDiagram): SVGSVGElement[] {
    return Array.from(
        diagram.container.querySelectorAll<SVGSVGElement>(
            "[data-element-id] .djs-visual > svg",
        ),
    );
}

async function expectSafeCanvas(diagram: TestDiagram): Promise<void> {
    // An unsafe nested image fires its error asynchronously in Chromium.
    await new Promise((resolve) => setTimeout(resolve, 75));

    expect((window as any)[EXECUTION_MARKER]).toBe(0);
    const icons = renderedIcons(diagram);
    expect(icons.length).toBeGreaterThan(0);
    for (const icon of icons) {
        expect(
            icon.querySelector(
                "script, foreignObject, animate, style, [onload], [onerror], [onclick]",
            ),
        ).toBeNull();
        expect(
            Array.from(icon.querySelectorAll("*")).every(
                (element) => element.namespaceURI === SVG_NS,
            ),
        ).toBe(true);
    }
}

function publishedSvgs(diagram: TestDiagram): string[] {
    const css =
        diagram.container.querySelector<HTMLStyleElement>(
            "[data-egon-icons-css]",
        )?.textContent ?? "";
    return Array.from(css.matchAll(/base64,([^')]+)/g), (match) =>
        new TextDecoder().decode(
            Uint8Array.from(atob(match[1]), (character) =>
                character.charCodeAt(0),
            ),
        ),
    );
}

describe("icon sanitization through real EgonClient instances (browser)", () => {
    const diagrams: TestDiagram[] = [];

    afterEach(() => {
        diagrams.splice(0).forEach((diagram) => diagram.cleanup());
        delete (window as any)[EXECUTION_MARKER];
    });

    async function create(
        probe = canvasProbe(),
    ): Promise<[TestDiagram, CanvasProbe]> {
        const diagram = await createTestDiagram({}, [probe.module]);
        diagrams.push(diagram);
        (window as any)[EXECUTION_MARKER] = 0;
        return [diagram, probe];
    }

    it("sanitizes story-imported actor/work-object icons and exports only the safe form", async () => {
        const [diagram] = await create();
        const unsafeDataUrl = `data:image/svg+xml;base64,${btoa(UNSAFE_SVG)}`;

        diagram.client.import(storyWithIcons(UNSAFE_SVG, unsafeDataUrl));
        await expectSafeCanvas(diagram);

        const exported = diagram.client.export();
        expect(exported.iconSet.actors["UnsafeActor"]).not.toMatch(
            /script|foreignObject|onload|onerror|onclick|__egonIconExecuted/,
        );
        const exportedData = atob(
            exported.iconSet.workObjects["UnsafeObject"].split(",")[1],
        );
        expect(exportedData).not.toMatch(
            /script|foreignObject|onload|onerror|onclick|__egonIconExecuted/,
        );
        expect(
            publishedSvgs(diagram).every(
                (svg) =>
                    !/script|foreignObject|onload|onerror|onclick|__egonIconExecuted/.test(
                        svg,
                    ),
            ),
        ).toBe(true);

        // A fresh client consumes only the normalized export and stays safe.
        const [reimported] = await create();
        reimported.client.import(exported);
        await expectSafeCanvas(reimported);
        expect(
            renderedIcons(reimported).map((icon) =>
                icon.querySelector("path")?.getAttribute("d"),
            ),
        ).toEqual(
            renderedIcons(diagram).map((icon) =>
                icon.querySelector("path")?.getAttribute("d"),
            ),
        );
    });

    it("sanitizes loadIcons() for actors and work objects before rendering and CSS publication", async () => {
        const [diagram, probe] = await create();

        diagram.client.loadIcons({
            actors: { LoadedActor: UNSAFE_SVG },
            workObjects: { LoadedObject: UNSAFE_SVG },
        });
        probe.create("actor", "LoadedActor");
        probe.create("workObject", "LoadedObject");

        await expectSafeCanvas(diagram);
        expect(diagram.client.getIcons().actors["LoadedActor"]).not.toContain(
            EXECUTION_MARKER,
        );
        expect(publishedSvgs(diagram).join("\n")).not.toContain(
            EXECUTION_MARKER,
        );
    });

    it("sanitizes addIcon() for actors and work objects, including malformed input", async () => {
        const [diagram, probe] = await create();

        diagram.client.addIcon("actor", "AddedActor", UNSAFE_SVG);
        diagram.client.addIcon(
            "workObject",
            "AddedObject",
            "<svg><path></svg>",
        );
        probe.create("actor", "AddedActor");
        probe.create("workObject", "AddedObject");

        await expectSafeCanvas(diagram);
        expect(diagram.client.hasIcon("actor", "AddedActor")).toBe(true);
        expect(diagram.client.hasIcon("workObject", "AddedObject")).toBe(true);
        expect(diagram.client.getIcons().workObjects["AddedObject"]).toContain(
            'viewBox="0 0 24 24"',
        );
    });

    it("applies the final boundary after a registry bypass and a color breakout attempt", async () => {
        const [diagram, probe] = await create();

        // Deliberately bypass every registration method by mutating the selected
        // dictionary exposed to legacy collaborators. The renderer must still
        // sanitize immediately before tiny-svg parses and appends the markup.
        probe.dictionary().getActorsDictionary().set("Bypassed", UNSAFE_SVG);
        probe.create(
            "actor",
            "Bypassed",
            `red" onload="window.${EXECUTION_MARKER}++`,
        );

        await expectSafeCanvas(diagram);
        const icon = renderedIcons(diagram)[0];
        expect(
            icon.querySelector("[fill]")?.getAttribute("fill") ?? "",
        ).not.toContain(EXECUTION_MARKER);
    });
});
