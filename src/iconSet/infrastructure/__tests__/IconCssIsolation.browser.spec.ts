import "diagram-js/assets/diagram-js.css";
import "../../../styles.scss";

import { afterEach, describe, expect, it, vi } from "vitest";
import type { ModuleDeclaration } from "didi";
import type Canvas from "diagram-js/lib/core/Canvas";
import type ElementRegistry from "diagram-js/lib/core/ElementRegistry";
import type EventBus from "diagram-js/lib/core/EventBus";
import type ContextPad from "diagram-js/lib/features/context-pad/ContextPad";
import type { Element as DiagramElement } from "diagram-js/lib/model/Types";

import {
    createTestDiagram,
    type TestDiagram,
} from "../../../__tests__/helpers/createTestDiagram";
import type { DomainStoryDocument } from "../../../story/domain/DomainStoryDocument";
import { ElementTypes } from "../../../story/domain/elementTypes";
import type { IconSetData } from "../../domain/IconTypes";
import type { IconStyleSheetConfig } from "../IconCssInjector";

const PERSON = "Person";
const DOCUMENT = "Document";

type ArtworkVersion = "A" | "B" | "C" | "D";
type HostLayout = "separate hosts" | "shared host";

interface SessionRecord {
    canvas: Canvas;
    canvasContainer: HTMLElement;
    contextPad: ContextPad;
    elementRegistry: ElementRegistry;
    styleElement: HTMLStyleElement;
    scopeId: string;
    destroyed: boolean;
}

interface SessionProbe {
    module: ModuleDeclaration;
    records: SessionRecord[];
    failOnShapeId?: string;
    active(): SessionRecord;
}

interface MaskSnapshot {
    palettePerson: string;
    paletteDocument: string;
    contextPerson: string;
    contextDocument: string;
}

function iconSvg(version: ArtworkVersion, shape: "circle" | "rect"): string {
    const artwork = `${version}-${shape}`;
    const inset = version === "A" || version === "B" ? 2 : 5;
    const diameter = 24 - inset * 2;
    const geometry =
        shape === "circle"
            ? `<circle cx="12" cy="12" r="${diameter / 2}" fill="#333"/>`
            : `<rect x="${inset}" y="${inset}" width="${diameter}" height="${diameter}" fill="#333"/>`;
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" ' +
        `data-artwork="${artwork}">${geometry}</svg>`
    );
}

function icons(version: ArtworkVersion): IconSetData {
    const personShape = version === "A" || version === "C" ? "circle" : "rect";
    const documentShape = personShape === "circle" ? "rect" : "circle";
    return {
        name: `icons-${version}`,
        actors: { [PERSON]: iconSvg(version, personShape) },
        workObjects: { [DOCUMENT]: iconSvg(version, documentShape) },
    };
}

function story(
    version: ArtworkVersion,
    failingShapeId?: string,
): DomainStoryDocument {
    const iconSet = icons(version);
    return {
        iconSet: {
            name: iconSet.name ?? "",
            actors: iconSet.actors ?? {},
            workObjects: iconSet.workObjects ?? {},
        },
        domainStory: {
            title: `story-${version}`,
            description: "",
            version: "4.0.0",
            businessObjects: [
                {
                    id: "actor",
                    type: ElementTypes.ACTOR + PERSON,
                    name: "actor",
                    x: 100,
                    y: 100,
                    width: 75,
                    height: 75,
                },
                {
                    id: failingShapeId ?? "work-object",
                    type: ElementTypes.WORKOBJECT + DOCUMENT,
                    name: "work object",
                    x: 300,
                    y: 100,
                    width: 75,
                    height: 75,
                },
            ],
        },
    };
}

function sessionProbe(): SessionProbe {
    const controller: SessionProbe = {
        module: {},
        records: [],
        active() {
            const record = [...this.records]
                .reverse()
                .find((candidate) => !candidate.destroyed);
            if (!record) throw new Error("no active editor session");
            return record;
        },
    };

    class Probe {
        static $inject = [
            "canvas",
            "contextPad",
            "elementRegistry",
            "eventBus",
            "config.domainStoryIconStyleSheet",
        ];

        constructor(
            canvas: Canvas,
            contextPad: ContextPad,
            elementRegistry: ElementRegistry,
            eventBus: EventBus,
            iconStyleSheet: IconStyleSheetConfig,
        ) {
            const record: SessionRecord = {
                canvas,
                canvasContainer: canvas.getContainer(),
                contextPad,
                elementRegistry,
                styleElement: iconStyleSheet.styleElement!,
                scopeId: iconStyleSheet.scopeId!,
                destroyed: false,
            };
            controller.records.push(record);
            eventBus.on("shape.added", (event: { element: { id: string } }) => {
                if (event.element.id === controller.failOnShapeId) {
                    throw new Error(`injected failure at ${event.element.id}`);
                }
            });
            eventBus.on("diagram.destroy", () => {
                record.destroyed = true;
            });
        }
    }

    controller.module = {
        __init__: ["iconCssIsolationProbe"],
        iconCssIsolationProbe: ["type", Probe],
    };
    return controller;
}

function decodeMask(maskImage: string): string {
    expect(maskImage).not.toBe("");
    expect(maskImage).not.toBe("none");
    const encoded = maskImage.match(/base64,([^"')]+)/)?.[1];
    if (!encoded)
        throw new Error(`mask does not contain base64 SVG: ${maskImage}`);
    return atob(encoded);
}

function publishedArtwork(styleElement: HTMLStyleElement): string[] {
    return Array.from(
        styleElement.textContent?.matchAll(/base64,([^"')]+)/g) ?? [],
        (match) => atob(match[1]),
    );
}

function maskOf(entry: Element): string {
    return getComputedStyle(entry, "::before").maskImage;
}

function snapshot(probe: SessionProbe, version: ArtworkVersion): MaskSnapshot {
    const session = probe.active();
    const canvasContainer = session.canvas.getContainer();
    expect(canvasContainer.getAttribute("data-egon-icon-scope")).toBe(
        session.scopeId,
    );

    const palettePerson = canvasContainer.querySelector(
        '[data-action="domainStory-actorPerson"]',
    )!;
    const paletteDocument = canvasContainer.querySelector(
        '[data-action="domainStory-workObjectDocument"]',
    )!;

    session.contextPad.close();
    session.contextPad.open(
        session.elementRegistry.get("work-object")! as DiagramElement,
    );
    const contextPerson = canvasContainer.querySelector(
        '.djs-context-pad.open [data-action="append.actorPerson"]',
    )!;
    const contextDocument = canvasContainer.querySelector(
        '.djs-context-pad.open [data-action="append.workObjectDocument"]',
    )!;

    const masks = {
        palettePerson: maskOf(palettePerson),
        paletteDocument: maskOf(paletteDocument),
        contextPerson: maskOf(contextPerson),
        contextDocument: maskOf(contextDocument),
    };

    for (const [key, mask] of Object.entries(masks)) {
        const isPerson = key.endsWith("Person");
        const shape =
            version === "A" || version === "C"
                ? isPerson
                    ? "circle"
                    : "rect"
                : isPerson
                  ? "rect"
                  : "circle";
        const svg = decodeMask(mask);
        expect(svg).toContain(`data-artwork="${version}-${shape}"`);
        expect(svg).toContain(`<${shape}`);
    }

    return masks;
}

function host(): HTMLDivElement {
    const element = document.createElement("div");
    element.style.width = "800px";
    element.style.height = "600px";
    document.body.appendChild(element);
    return element;
}

describe.each<HostLayout>(["separate hosts", "shared host"])(
    "icon CSS isolation with %s",
    (layout) => {
        const diagrams: TestDiagram[] = [];
        const hosts: HTMLElement[] = [];

        afterEach(() => {
            diagrams.splice(0).forEach((diagram) => diagram.cleanup());
            hosts.splice(0).forEach((element) => element.remove());
            vi.restoreAllMocks();
        });

        async function createIn(
            target: HTMLElement,
            probe: SessionProbe,
        ): Promise<TestDiagram> {
            const diagram = await createTestDiagram({}, [probe.module], target);
            diagrams.push(diagram);
            return diagram;
        }

        async function pair(): Promise<{
            first: TestDiagram;
            firstProbe: SessionProbe;
            second: TestDiagram;
            secondProbe: SessionProbe;
        }> {
            const firstHost = host();
            const secondHost = layout === "shared host" ? firstHost : host();
            hosts.push(firstHost);
            if (secondHost !== firstHost) hosts.push(secondHost);

            const firstProbe = sessionProbe();
            const secondProbe = sessionProbe();
            const first = await createIn(firstHost, firstProbe);
            first.client.import(story("A"));
            const firstMasks = snapshot(firstProbe, "A");

            const second = await createIn(secondHost, secondProbe);
            second.client.import(story("B"));
            expect(snapshot(firstProbe, "A")).toEqual(firstMasks);
            snapshot(secondProbe, "B");

            expect(firstProbe.active().scopeId).not.toBe(
                secondProbe.active().scopeId,
            );
            return { first, firstProbe, second, secondProbe };
        }

        function dispose(diagram: TestDiagram): void {
            const index = diagrams.indexOf(diagram);
            if (index >= 0) diagrams.splice(index, 1);
            diagram.cleanup();
        }

        it("keeps palette and context-pad masks isolated through replacement and import", async () => {
            const { first, firstProbe, second, secondProbe } = await pair();

            const secondBeforeReplacement = snapshot(secondProbe, "B");
            first.client.loadIcons(icons("C"));
            const firstAfterReplacement = snapshot(firstProbe, "C");
            expect(snapshot(secondProbe, "B")).toEqual(secondBeforeReplacement);

            second.client.loadIcons(icons("D"));
            expect(snapshot(firstProbe, "C")).toEqual(firstAfterReplacement);
            snapshot(secondProbe, "D");

            const secondAfterLoad = snapshot(secondProbe, "D");
            const firstBeforeImport = firstProbe.active();
            first.client.import(story("A"));
            expect(firstProbe.active().scopeId).not.toBe(
                firstBeforeImport.scopeId,
            );
            expect(firstBeforeImport.canvasContainer.isConnected).toBe(false);
            expect(firstBeforeImport.styleElement.isConnected).toBe(false);
            snapshot(firstProbe, "A");
            expect(snapshot(secondProbe, "D")).toEqual(secondAfterLoad);

            const firstAfterImport = snapshot(firstProbe, "A");
            const secondBeforeImport = secondProbe.active();
            second.client.import(story("B"));
            expect(secondProbe.active().scopeId).not.toBe(
                secondBeforeImport.scopeId,
            );
            expect(secondBeforeImport.canvasContainer.isConnected).toBe(false);
            expect(secondBeforeImport.styleElement.isConnected).toBe(false);
            expect(snapshot(firstProbe, "A")).toEqual(firstAfterImport);
            snapshot(secondProbe, "B");
        });

        it.each(["first", "second"] as const)(
            "survives destroying and recreating the %s client, including a failed staged import",
            async (destroyed) => {
                const pairState = await pair();
                const removed = pairState[destroyed];
                const removedProbe = pairState[`${destroyed}Probe`];
                const survivor = destroyed === "first" ? "second" : "first";
                const survivorProbe = pairState[`${survivor}Probe`];
                const survivorVersion = survivor === "first" ? "A" : "B";
                const survivorMasks = snapshot(survivorProbe, survivorVersion);
                const oldSession = removedProbe.active();
                const recreateHost = removed.container;

                dispose(removed);
                expect(oldSession.canvasContainer.isConnected).toBe(false);
                expect(oldSession.styleElement.isConnected).toBe(false);
                expect(snapshot(survivorProbe, survivorVersion)).toEqual(
                    survivorMasks,
                );

                const recreatedProbe = sessionProbe();
                const recreated = await createIn(recreateHost, recreatedProbe);
                recreated.client.import(story("C"));
                snapshot(recreatedProbe, "C");
                expect(snapshot(survivorProbe, survivorVersion)).toEqual(
                    survivorMasks,
                );

                const activeBeforeFailure = recreatedProbe.active();
                const recreatedMasks = snapshot(recreatedProbe, "C");
                recreatedProbe.failOnShapeId = "shape-fail";
                const errorLog = vi
                    .spyOn(console, "error")
                    .mockImplementation(() => {});
                try {
                    expect(() =>
                        recreated.client.import(story("D", "shape-fail")),
                    ).toThrow(/injected failure at shape-fail/);
                } finally {
                    errorLog.mockRestore();
                }

                const failedCandidate = recreatedProbe.records.at(-1)!;
                expect(failedCandidate).not.toBe(activeBeforeFailure);
                expect(failedCandidate.destroyed).toBe(true);
                expect(
                    publishedArtwork(failedCandidate.styleElement).some((svg) =>
                        svg.includes('data-artwork="D-rect"'),
                    ),
                ).toBe(true);
                expect(failedCandidate.canvasContainer.isConnected).toBe(false);
                expect(failedCandidate.styleElement.isConnected).toBe(false);
                expect(
                    recreateHost.querySelector("[data-egon-import-candidate]"),
                ).toBeNull();
                expect(snapshot(recreatedProbe, "C")).toEqual(recreatedMasks);
                expect(snapshot(survivorProbe, survivorVersion)).toEqual(
                    survivorMasks,
                );
            },
        );
    },
);
