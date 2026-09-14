import { afterEach, describe, expect, it } from "vitest";

import {
    createTestDiagram,
    type TestDiagram,
} from "../../../__tests__/helpers/createTestDiagram";
import type { DomainStoryDocument } from "../../domain/DomainStoryDocument";
import { ElementTypes } from "../../domain/elementTypes";

const actorSvg =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" data-artwork="spaced-actor"><circle cx="12" cy="12" r="10"/></svg>';
const workObjectSvg =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" data-artwork="spaced-dot-work-object"><rect x="2" y="2" width="20" height="20"/></svg>';

function iconStory(
    actorDictionaryName: string,
    workObjectDictionaryName: string,
): DomainStoryDocument {
    return {
        iconSet: {
            name: "whitespace icons",
            actors: { [actorDictionaryName]: actorSvg },
            workObjects: { [workObjectDictionaryName]: workObjectSvg },
        },
        domainStory: {
            title: "icon whitespace",
            description: "",
            version: "4.0.0",
            businessObjects: [
                {
                    id: "shape_actor",
                    type: `${ElementTypes.ACTOR}Customer Support`,
                    name: "Support",
                    x: 100,
                    y: 100,
                },
                {
                    id: "shape_work_object",
                    type: `${ElementTypes.WORKOBJECT}Case File.v2`,
                    name: "Case",
                    x: 350,
                    y: 100,
                },
            ],
        },
    };
}

function legacyIconStory(): DomainStoryDocument {
    return {
        domain: {
            name: "legacy whitespace icons",
            actors: { "Customer-Support": actorSvg },
            workObjects: { "Case-File.v2": workObjectSvg },
        },
        dst: [
            {
                id: "shape_actor",
                type: `${ElementTypes.ACTOR}Customer Support`,
                name: "Support",
                x: 100,
                y: 100,
            },
            {
                id: "shape_work_object",
                type: `${ElementTypes.WORKOBJECT}Case File.v2`,
                name: "Case",
                x: 350,
                y: 100,
            },
            { info: "legacy whitespace" },
            { version: "2.2.0" },
        ],
    } as unknown as DomainStoryDocument;
}

function elementType(document: DomainStoryDocument, id: string): string {
    const elements = document.domainStory.businessObjects as readonly {
        id: string;
        type: string;
    }[];
    const element = elements.find((candidate) => candidate.id === id);
    if (!element) throw new Error(`missing exported element ${id}`);
    return element.type;
}

function renderedArtwork(
    diagram: TestDiagram,
    elementId: string,
): string | null {
    return (
        diagram.container
            .querySelector(`[data-element-id="${elementId}"] .djs-visual > svg`)
            ?.getAttribute("data-artwork") ?? null
    );
}

describe("icon-name whitespace compatibility (browser)", () => {
    const diagrams: TestDiagram[] = [];

    afterEach(() => {
        diagrams.splice(0).forEach((diagram) => diagram.cleanup());
    });

    it("preserves verbatim v4 names and artwork through two fresh clients", async () => {
        const source = iconStory("Customer Support", "Case File.v2");
        const first = await createTestDiagram();
        diagrams.push(first);

        first.client.import(source);
        const firstExport = first.client.export();

        expect(Object.keys(firstExport.iconSet.actors)).toEqual([
            "Customer Support",
        ]);
        expect(Object.keys(firstExport.iconSet.workObjects)).toEqual([
            "Case File.v2",
        ]);
        expect(elementType(firstExport, "shape_actor")).toBe(
            `${ElementTypes.ACTOR}Customer Support`,
        );
        expect(elementType(firstExport, "shape_work_object")).toBe(
            `${ElementTypes.WORKOBJECT}Case File.v2`,
        );
        expect(renderedArtwork(first, "shape_actor")).toBe("spaced-actor");
        expect(renderedArtwork(first, "shape_work_object")).toBe(
            "spaced-dot-work-object",
        );

        first.cleanup();
        diagrams.splice(diagrams.indexOf(first), 1);
        const second = await createTestDiagram();
        diagrams.push(second);
        second.client.import(firstExport);

        expect(renderedArtwork(second, "shape_actor")).toBe("spaced-actor");
        expect(renderedArtwork(second, "shape_work_object")).toBe(
            "spaced-dot-work-object",
        );
        expect(second.client.export()).toEqual(firstExport);
    });

    it("repairs legacy spaced references only when hyphenated assets exist", async () => {
        const source = legacyIconStory();
        const first = await createTestDiagram();
        diagrams.push(first);

        first.client.import(source);
        const repaired = first.client.export();

        expect(elementType(repaired, "shape_actor")).toBe(
            `${ElementTypes.ACTOR}Customer-Support`,
        );
        expect(elementType(repaired, "shape_work_object")).toBe(
            `${ElementTypes.WORKOBJECT}Case-File.v2`,
        );
        expect(renderedArtwork(first, "shape_actor")).toBe("spaced-actor");
        expect(renderedArtwork(first, "shape_work_object")).toBe(
            "spaced-dot-work-object",
        );

        first.cleanup();
        diagrams.splice(diagrams.indexOf(first), 1);
        const second = await createTestDiagram();
        diagrams.push(second);
        second.client.import(repaired);

        expect(renderedArtwork(second, "shape_actor")).toBe("spaced-actor");
        expect(renderedArtwork(second, "shape_work_object")).toBe(
            "spaced-dot-work-object",
        );
        expect(second.client.export()).toEqual(repaired);
    });
});
