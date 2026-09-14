import "diagram-js/assets/diagram-js.css";
import "../../../styles.scss";

import { afterEach, describe, expect, it } from "vitest";
import type { ModuleDeclaration } from "didi";
import type Canvas from "diagram-js/lib/core/Canvas";
import type ContextPad from "diagram-js/lib/features/context-pad/ContextPad";
import type ElementRegistry from "diagram-js/lib/core/ElementRegistry";
import type { Shape } from "diagram-js/lib/model/Types";

import {
    createTestDiagram,
    type TestDiagram,
} from "../../../__tests__/helpers/createTestDiagram";
import {
    decodeUtf8Base64,
    UNICODE_ICON_CONTENT,
    UNICODE_ICON_GEOMETRY,
    unicodeIconSource,
    type SvgRepresentation,
} from "../../../__tests__/fixtures/unicodeIcons";
import type { DomainStoryDocument } from "../../../story/domain/DomainStoryDocument";
import { ElementTypes } from "../../../story/domain/elementTypes";
import type { DomainStoryElementFactory } from "../../infrastructure/element-factory/DomainStoryElementFactory";
import type { DomainStoryModeling } from "../../infrastructure/modeling/DomainStoryModeling";

const ACTOR_COLOR = "#7a21c4";
const WORK_OBJECT_COLOR = "#0b7285";

interface IconNames {
    actor: string;
    workObject: string;
}

interface CanvasProbe {
    module: ModuleDeclaration;
    create(category: keyof IconNames, name: string, color: string): Shape;
    element(id: string): Shape;
    openContextPad(element: Shape): void;
}

interface Journey {
    label: string;
    representation: SvgRepresentation;
    populate(diagram: TestDiagram, probe: CanvasProbe, names: IconNames): void;
}

function namesFor(representation: SvgRepresentation): IconNames {
    const suffix = representation[0].toUpperCase() + representation.slice(1);
    return {
        actor: `Unicode${suffix}Actor`,
        workObject: `Unicode${suffix}WorkObject`,
    };
}

function canvasProbe(): CanvasProbe {
    let canvas: Canvas | undefined;
    let contextPad: ContextPad | undefined;
    let elementRegistry: ElementRegistry | undefined;
    let factory: DomainStoryElementFactory | undefined;
    let modeling: DomainStoryModeling | undefined;

    function capture(
        injectedCanvas: Canvas,
        injectedContextPad: ContextPad,
        injectedElementRegistry: ElementRegistry,
        injectedFactory: DomainStoryElementFactory,
        injectedModeling: DomainStoryModeling,
    ): void {
        canvas = injectedCanvas;
        contextPad = injectedContextPad;
        elementRegistry = injectedElementRegistry;
        factory = injectedFactory;
        modeling = injectedModeling;
    }
    capture.$inject = [
        "canvas",
        "contextPad",
        "elementRegistry",
        "elementFactory",
        "modeling",
    ];

    return {
        module: { __init__: [capture] },
        create(category, name, color) {
            if (!canvas || !factory || !modeling) {
                throw new Error("Unicode icon probe was never injected");
            }
            const prefix =
                category === "actor"
                    ? ElementTypes.ACTOR
                    : ElementTypes.WORKOBJECT;
            const shape = factory.create("shape", {
                id:
                    category === "actor"
                        ? "unicode_actor"
                        : "unicode_work_object",
                type: prefix + name,
            });
            shape.businessObject.pickedColor = color;
            return modeling.createShape(
                shape,
                category === "actor" ? { x: 150, y: 150 } : { x: 350, y: 150 },
                canvas.getRootElement() as unknown as Shape,
            );
        },
        element(id) {
            const element = elementRegistry?.get(id);
            if (!element) throw new Error(`Missing canvas element ${id}`);
            return element as Shape;
        },
        openContextPad(element) {
            if (!contextPad) {
                throw new Error("Unicode icon probe was never injected");
            }
            contextPad.close();
            contextPad.open(element);
        },
    };
}

function story(
    representation: SvgRepresentation,
    names: IconNames,
): DomainStoryDocument {
    const source = unicodeIconSource(representation);
    return {
        iconSet: {
            name: `unicode-${representation}`,
            actors: { [names.actor]: source },
            workObjects: { [names.workObject]: source },
        },
        domainStory: {
            title: `Unicode ${representation} 🎬`,
            description: "导演 Сценарий",
            version: "4.0.0",
            businessObjects: [
                {
                    id: "unicode_actor",
                    type: ElementTypes.ACTOR + names.actor,
                    name: "actor",
                    x: 100,
                    y: 100,
                    width: 75,
                    height: 75,
                    pickedColor: ACTOR_COLOR,
                },
                {
                    id: "unicode_work_object",
                    type: ElementTypes.WORKOBJECT + names.workObject,
                    name: "work object",
                    x: 300,
                    y: 100,
                    width: 75,
                    height: 75,
                    pickedColor: WORK_OBJECT_COLOR,
                },
            ],
        },
    };
}

function decodeSvgDataUrl(dataUrl: string): string {
    const match = /^data:image\/svg\+xml;base64,([\s\S]+)$/i.exec(dataUrl);
    if (!match) throw new Error(`Expected Base64 SVG data URL: ${dataUrl}`);
    return decodeUtf8Base64(match[1]);
}

function expectUnicodeSvg(svg: string, color?: string): SVGSVGElement {
    const parsed = new DOMParser().parseFromString(svg, "image/svg+xml");
    expect(parsed.querySelector("parsererror")).toBeNull();
    const root = parsed.documentElement as unknown as SVGSVGElement;

    expect(root.querySelector("title")?.textContent).toBe(
        UNICODE_ICON_CONTENT.title,
    );
    expect(root.querySelector("desc")?.textContent).toBe(
        UNICODE_ICON_CONTENT.description,
    );
    expect(root.querySelector("text")?.childNodes[0]?.textContent).toBe(
        UNICODE_ICON_CONTENT.text,
    );
    expect(root.querySelector("tspan")?.textContent).toBe(
        UNICODE_ICON_CONTENT.tspan,
    );
    expect(root.querySelector("textPath")?.textContent).toBe(
        UNICODE_ICON_CONTENT.textPath,
    );
    expect(root.getAttribute("aria-label")).toBe(
        UNICODE_ICON_CONTENT.ariaLabel,
    );
    expect(root.getAttribute("data-label")).toBe(
        UNICODE_ICON_CONTENT.dataLabel,
    );
    expect(root.getAttribute("viewBox")).toBe(UNICODE_ICON_GEOMETRY.viewBox);
    const geometry = root.querySelector('[data-geometry="solid"]');
    expect(geometry?.getAttribute("d")).toBe(UNICODE_ICON_GEOMETRY.rect);
    if (color) expect(geometry?.getAttribute("fill")).toBe(color);
    return root;
}

async function expectRasterized(dataUrl: string): Promise<void> {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error("SVG image failed to load"));
        image.src = dataUrl;
    });

    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    const context = canvas.getContext("2d");
    expect(context).not.toBeNull();
    context!.drawImage(image, 0, 0, canvas.width, canvas.height);
    const pixels = context!.getImageData(
        0,
        0,
        canvas.width,
        canvas.height,
    ).data;
    expect(
        Array.from({ length: pixels.length / 4 }).some(
            (_, index) => pixels[index * 4 + 3] > 0,
        ),
    ).toBe(true);
}

function renderedIcon(diagram: TestDiagram, elementId: string): SVGSVGElement {
    const icon = diagram.container.querySelector<SVGSVGElement>(
        `[data-element-id="${elementId}"] .djs-visual > svg`,
    );
    if (!icon) throw new Error(`Missing rendered icon for ${elementId}`);
    return icon;
}

async function expectCanvasArtwork(
    diagram: TestDiagram,
    representation: SvgRepresentation,
): Promise<void> {
    for (const [elementId, color] of [
        ["unicode_actor", ACTOR_COLOR],
        ["unicode_work_object", WORK_OBJECT_COLOR],
    ] as const) {
        const icon = renderedIcon(diagram, elementId);

        if (representation === "raw") {
            expectUnicodeSvg(icon.outerHTML, color);
            const geometry = icon.querySelector<SVGGraphicsElement>(
                '[data-geometry="solid"]',
            )!;
            const text = icon.querySelector<SVGGraphicsElement>("text")!;
            expect(geometry.getBBox().width).toBeGreaterThan(0);
            expect(geometry.getBBox().height).toBeGreaterThan(0);
            expect(text.getBBox().width).toBeGreaterThan(0);
            expect(text.getBBox().height).toBeGreaterThan(0);
            continue;
        }

        const image = icon.querySelector<SVGGraphicsElement & SVGImageElement>(
            "image",
        )!;
        const href = image.getAttribute("href")!;
        expectUnicodeSvg(decodeSvgDataUrl(href), color);
        expect(image.getBBox().width).toBeGreaterThan(0);
        expect(image.getBBox().height).toBeGreaterThan(0);
        await expectRasterized(href);
    }
}

function maskDataUrl(entry: Element): string {
    const mask = getComputedStyle(entry, "::before").maskImage;
    expect(mask).not.toBe("");
    expect(mask).not.toBe("none");
    const match = /url\(["']?([^"')]+)["']?\)/.exec(mask);
    if (!match) throw new Error(`Missing mask URL in ${mask}`);
    return match[1];
}

async function expectRawControlMasks(
    diagram: TestDiagram,
    probe: CanvasProbe,
    names: IconNames,
): Promise<void> {
    probe.openContextPad(probe.element("unicode_work_object"));
    const selectors = [
        `[data-action="domainStory-actor${names.actor}"]`,
        `[data-action="domainStory-workObject${names.workObject}"]`,
        `.djs-context-pad.open [data-action="append.actor${names.actor}"]`,
        `.djs-context-pad.open [data-action="append.workObject${names.workObject}"]`,
    ];

    for (const selector of selectors) {
        const entry = diagram.container.querySelector(selector);
        expect(entry, selector).not.toBeNull();
        const dataUrl = maskDataUrl(entry!);
        expectUnicodeSvg(decodeSvgDataUrl(dataUrl));
        await expectRasterized(dataUrl);
    }
}

function exportedIconStrings(
    document: DomainStoryDocument,
    names: IconNames,
): [string, string] {
    return [
        document.iconSet.actors[names.actor],
        document.iconSet.workObjects[names.workObject],
    ];
}

const JOURNEYS: Journey[] = [
    {
        label: "loadIcons() with raw SVG",
        representation: "raw",
        populate(diagram, probe, names) {
            const source = unicodeIconSource("raw");
            diagram.client.loadIcons({
                name: "unicode-raw",
                actors: { [names.actor]: source },
                workObjects: { [names.workObject]: source },
            });
            probe.create("actor", names.actor, ACTOR_COLOR);
            probe.create("workObject", names.workObject, WORK_OBJECT_COLOR);
        },
    },
    {
        label: "addIcon() with UTF-8 Base64 SVG data URLs",
        representation: "base64",
        populate(diagram, probe, names) {
            const source = unicodeIconSource("base64");
            diagram.client.addIcon("actor", names.actor, source);
            diagram.client.addIcon("workObject", names.workObject, source);
            probe.create("actor", names.actor, ACTOR_COLOR);
            probe.create("workObject", names.workObject, WORK_OBJECT_COLOR);
        },
    },
    {
        label: "document import with percent-encoded SVG data URLs",
        representation: "percent",
        populate(diagram, _probe, names) {
            diagram.client.import(story("percent", names));
        },
    },
];

describe("Unicode icons through real EgonClient instances (browser)", () => {
    const diagrams: TestDiagram[] = [];

    afterEach(() => {
        diagrams.splice(0).forEach((diagram) => diagram.cleanup());
    });

    async function create(): Promise<[TestDiagram, CanvasProbe]> {
        const probe = canvasProbe();
        const diagram = await createTestDiagram({}, [probe.module]);
        diagrams.push(diagram);
        return [diagram, probe];
    }

    it.each(JOURNEYS)(
        "preserves, renders, recolors, exports, and re-imports $label",
        async ({ representation, populate }) => {
            const names = namesFor(representation);
            const [diagram, probe] = await create();
            populate(diagram, probe, names);

            await expectCanvasArtwork(diagram, representation);
            if (representation === "raw") {
                await expectRawControlMasks(diagram, probe, names);
            }

            const firstExport = diagram.client.export();
            const serialized = JSON.stringify(firstExport);
            for (const icon of exportedIconStrings(firstExport, names)) {
                const svg = icon.startsWith("data:")
                    ? decodeSvgDataUrl(icon)
                    : icon;
                expectUnicodeSvg(svg);
            }

            const [reimported] = await create();
            reimported.client.import(
                JSON.parse(serialized) as DomainStoryDocument,
            );
            await expectCanvasArtwork(reimported, representation);

            expect(
                exportedIconStrings(reimported.client.export(), names),
            ).toEqual(exportedIconStrings(firstExport, names));
        },
    );
});
