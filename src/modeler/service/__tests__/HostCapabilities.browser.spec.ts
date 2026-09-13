import { afterEach, describe, expect, it, vi } from "vitest";
import type CommandStack from "diagram-js/lib/command/CommandStack";
import type { ModuleDeclaration } from "didi";

import {
    createTestDiagram,
    type TestDiagram,
} from "../../../__tests__/helpers/createTestDiagram";
import {
    TEST_ICON_NAMES,
    TEST_ICON_SET,
} from "../../../__tests__/helpers/testIconSet";
import type { DomainStoryDocument } from "../../../story/domain/DomainStoryDocument";
import { ElementTypes } from "../../../story/domain/elementTypes";

function commandStackProbe(): {
    module: ModuleDeclaration;
    commandStack(): CommandStack;
} {
    let value: CommandStack | undefined;
    function capture(commandStack: CommandStack) {
        value = commandStack;
    }
    capture.$inject = ["commandStack"];
    return {
        module: { __init__: [capture] },
        commandStack: () => value!,
    };
}

function story(): DomainStoryDocument {
    return {
        iconSet: {
            name: "host-capabilities",
            actors: TEST_ICON_SET.actors ?? {},
            workObjects: TEST_ICON_SET.workObjects ?? {},
        },
        domainStory: {
            title: "A & <DST> -- literal –– title",
            description: "Unicode äöü and </DST> stays data",
            version: "4.0.0",
            businessObjects: [
                {
                    id: "group",
                    type: ElementTypes.GROUP,
                    name: "Boundary",
                    x: -160,
                    y: -100,
                    width: 700,
                    height: 350,
                },
                {
                    id: "group_inner",
                    type: ElementTypes.GROUP,
                    name: "Inner",
                    x: -130,
                    y: -50,
                    width: 520,
                    height: 230,
                    parent: "group",
                },
                {
                    id: "actor_a",
                    type: ElementTypes.ACTOR + TEST_ICON_NAMES.person,
                    name: "Alice",
                    x: -100,
                    y: 0,
                    width: 75,
                    height: 75,
                    parent: "group_inner",
                },
                {
                    id: "work_a",
                    type: ElementTypes.WORKOBJECT + TEST_ICON_NAMES.document,
                    name: "Invoice",
                    x: 100,
                    y: 0,
                    width: 75,
                    height: 75,
                    parent: "group_inner",
                },
                {
                    id: "actor_b",
                    type: ElementTypes.ACTOR + TEST_ICON_NAMES.person,
                    name: "Bob",
                    x: 300,
                    y: 0,
                    width: 75,
                    height: 75,
                },
                {
                    id: "work_b",
                    type: ElementTypes.WORKOBJECT + TEST_ICON_NAMES.document,
                    name: "Receipt",
                    x: 450,
                    y: 0,
                    width: 75,
                    height: 75,
                },
                {
                    id: "annotation",
                    type: ElementTypes.TEXTANNOTATION,
                    name: "Context",
                    x: -100,
                    y: 140,
                    width: 120,
                    height: 45,
                },
                activity("step_1", "actor_a", "work_a", "send", 1, -25, 137),
                activity(
                    "downstream",
                    "work_a",
                    "actor_b",
                    "deliver",
                    null,
                    175,
                    337,
                ),
                activity("step_2", "actor_b", "work_b", "receive", 2, 375, 487),
                {
                    id: "annotation_link",
                    type: ElementTypes.CONNECTION,
                    name: "",
                    source: "actor_a",
                    target: "annotation",
                    waypoints: [
                        { x: -62, y: 75 },
                        { x: -40, y: 140 },
                    ],
                },
            ],
        },
    };
}

function activity(
    id: string,
    source: string,
    target: string,
    name: string,
    number: number | null,
    startX: number,
    endX: number,
) {
    return {
        id,
        type: ElementTypes.ACTIVITY,
        name,
        source,
        target,
        number,
        multipleNumberAllowed: false,
        waypoints: [
            { x: startX, y: 37 },
            { x: endX, y: 37 },
        ],
    };
}

/** Mirrors the recorded WPS raw-text decoder. */
function extractEmbeddedDocument(svg: string): DomainStoryDocument {
    const decoded = svg
        .replaceAll("––", "--")
        .replaceAll("&#34;", '"')
        .replaceAll("&#39;", "'")
        .replaceAll("&#43;", "+")
        .replaceAll("&#61;", "=")
        .replaceAll("%3C", "<")
        .replaceAll("%3E", ">");
    const start = decoded.indexOf("<DST>") + "<DST>".length;
    const end = decoded.indexOf("</DST>", start);
    return JSON.parse(decoded.slice(start, end));
}

async function hasNonWhitePixel(bytes: Uint8Array): Promise<boolean> {
    const bitmap = await createImageBitmap(
        new Blob([bytes], { type: "image/png" }),
    );
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d")!;
    context.drawImage(bitmap, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    bitmap.close();
    for (let index = 0; index < pixels.length; index += 4) {
        if (
            pixels[index + 3] > 0 &&
            (pixels[index] < 250 ||
                pixels[index + 1] < 250 ||
                pixels[index + 2] < 250)
        ) {
            return true;
        }
    }
    return false;
}

describe("remaining host capabilities", () => {
    let diagram: TestDiagram | undefined;

    afterEach(() => {
        diagram?.cleanup();
        diagram = undefined;
    });

    it("exports a standalone SVG and decodable PNG without changing the story", async () => {
        diagram = await createTestDiagram();
        const imported = story();
        diagram.client.import(imported);
        diagram.client.setViewport({ x: 100, y: 100, width: 300, height: 200 });
        const before = diagram.client.export();
        const viewport = diagram.client.getViewport();

        const svg = await diagram.client.exportSVG({
            includeTitle: true,
            includeDescription: true,
        });
        expect(svg.width).toBeGreaterThan(500);
        expect(svg.height).toBeGreaterThan(250);
        expect(svg.svg).toContain("hiddenDomainStory");
        expect(svg.svg).not.toContain('class="viewport"');
        expect(
            new DOMParser().parseFromString(svg.svg, "image/svg+xml")
                .documentElement.localName,
        ).toBe("svg");
        expect(extractEmbeddedDocument(svg.svg)).toEqual(before);

        const png = await diagram.client.exportPNG({ scale: 1.5 });
        expect([...png.bytes.slice(0, 8)]).toEqual([
            137, 80, 78, 71, 13, 10, 26, 10,
        ]);
        expect(await hasNonWhitePixel(png.bytes)).toBe(true);
        expect(png.width).toBe(Math.ceil(svg.width * 1.5));
        expect(diagram.client.export()).toEqual(before);
        expect(diagram.client.getViewport()).toEqual(viewport);
    });

    it("cancels PNG work explicitly, on replacement, and on destruction", async () => {
        diagram = await createTestDiagram();
        diagram.client.import(story());

        const explicit = new AbortController();
        const explicitlyCancelled = diagram.client.exportPNG({
            signal: explicit.signal,
        });
        explicit.abort();
        await expect(explicitlyCancelled).rejects.toMatchObject({
            name: "AbortError",
        });

        const replaced = diagram.client.exportPNG();
        diagram.client.import(story());
        await expect(replaced).rejects.toMatchObject({ name: "AbortError" });

        const failedImportSurvivor = diagram.client.exportPNG();
        expect(() =>
            diagram!.client.import({} as DomainStoryDocument),
        ).toThrow();
        await expect(failedImportSurvivor).resolves.toMatchObject({
            width: expect.any(Number),
            height: expect.any(Number),
        });

        const destroyed = diagram.client.exportPNG();
        diagram.client.destroy();
        await expect(destroyed).rejects.toMatchObject({ name: "AbortError" });
    });

    it("renames simultaneously as one undoable action and publishes snapshots", async () => {
        const probe = commandStackProbe();
        diagram = await createTestDiagram({}, [probe.module]);
        diagram.client.import(story());
        const changed = vi.fn();
        diagram.client.on("labels.changed", changed);

        expect(
            diagram.client.getLabelDictionary().activities.map((x) => x.name),
        ).toEqual(["deliver", "receive", "send"]);
        expect(
            diagram.client.renameLabels([
                { category: "activity", originalName: "send", name: "receive" },
                { category: "activity", originalName: "receive", name: "send" },
                { category: "workObject", originalName: "Invoice", name: "" },
            ]),
        ).toEqual(["work_a", "step_1", "step_2"]);
        expect(changed).toHaveBeenCalledTimes(1);

        const names = Object.fromEntries(
            (diagram.client.export().domainStory.businessObjects as any[]).map(
                (x) => [x.id, x.name],
            ),
        );
        expect(names).toMatchObject({
            work_a: "",
            step_1: "receive",
            step_2: "send",
        });

        probe.commandStack().undo();
        expect(changed).toHaveBeenCalledTimes(2);
        expect(
            diagram.client.getLabelDictionary().activities.map((x) => x.name),
        ).toEqual(["deliver", "receive", "send"]);
    });

    it("exposes exact icon ordering and cumulative timer-free replay", async () => {
        const probe = commandStackProbe();
        diagram = await createTestDiagram({}, [probe.module]);
        diagram.client.import(story());

        const config = diagram.client.getIconConfiguration();
        const reversed = [...config.selected.actor].reverse();
        diagram.client.setIconOrder("actor", reversed);
        expect(diagram.client.getIconConfiguration()).toMatchObject({
            name: "host-capabilities",
            selected: { actor: reversed },
            used: {
                actor: [TEST_ICON_NAMES.person],
                workObject: [TEST_ICON_NAMES.document],
            },
        });
        expect(() =>
            diagram!.client.setIconOrder("actor", [reversed[0]]),
        ).toThrow(/exact permutation/);
        diagram.client.renameLabels([
            { category: "activity", originalName: "send", name: "sent" },
        ]);

        const replayChanged = vi.fn();
        diagram.client.on("replay.changed", replayChanged);
        expect(diagram.client.startReplay()).toMatchObject({
            active: true,
            stepIndex: 0,
            stepCount: 2,
            activityNumber: 1,
            hasGroups: true,
            showGroups: false,
        });
        expect(
            diagram.container.querySelector('[data-element-id="work_b"]')
                ?.classList,
        ).toContain("egon-replay-hidden");
        expect(
            diagram.container.querySelector('[data-element-id="annotation"]')
                ?.classList,
        ).not.toContain("egon-replay-hidden");

        expect(diagram.client.nextReplayStep()).toMatchObject({
            stepIndex: 1,
            activityNumber: 2,
        });
        expect(diagram.client.nextReplayStep().stepIndex).toBe(1);
        expect(diagram.client.setReplayShowGroups(true).showGroups).toBe(true);
        expect(
            diagram.container.querySelector('[data-element-id="group"]')
                ?.classList,
        ).not.toContain("egon-replay-hidden");

        probe.commandStack().undo();
        expect(diagram.client.getReplayState().active).toBe(false);
        expect(replayChanged).toHaveBeenCalled();
    });

    it("publishes labels and stops replay only after a successful replacement", async () => {
        diagram = await createTestDiagram();
        diagram.client.import(story());
        const labelsChanged = vi.fn();
        diagram.client.on("labels.changed", labelsChanged);

        diagram.client.import(story());
        expect(labelsChanged).toHaveBeenCalledTimes(1);
        diagram.client.startReplay();

        expect(() =>
            diagram!.client.import({} as DomainStoryDocument),
        ).toThrow();
        expect(diagram.client.getReplayState().active).toBe(true);
        expect(labelsChanged).toHaveBeenCalledTimes(1);

        diagram.client.import(story());
        expect(diagram.client.getReplayState().active).toBe(false);
        expect(labelsChanged).toHaveBeenCalledTimes(2);
    });

    it("keeps replay markers scoped when clients reuse element ids", async () => {
        diagram = await createTestDiagram();
        const second = await createTestDiagram();
        try {
            diagram.client.import(story());
            second.client.import(story());

            diagram.client.startReplay();

            expect(
                diagram.container.querySelector('[data-element-id="work_b"]')
                    ?.classList,
            ).toContain("egon-replay-hidden");
            expect(
                second.container.querySelector('[data-element-id="work_b"]')
                    ?.classList,
            ).not.toContain("egon-replay-hidden");
        } finally {
            second.cleanup();
        }
    });
});
