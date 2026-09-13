import "diagram-js/assets/diagram-js.css";
import "../../../styles.scss";

import { afterEach, describe, expect, it, vi } from "vitest";
import type CommandStack from "diagram-js/lib/command/CommandStack";
import type ElementRegistry from "diagram-js/lib/core/ElementRegistry";
import type ContextPad from "diagram-js/lib/features/context-pad/ContextPad";
import type Selection from "diagram-js/lib/features/selection/Selection";
import type { Element } from "diagram-js/lib/model/Types";
import type { ModuleDeclaration } from "didi";

import {
    createTestDiagram,
    type TestDiagram,
} from "../../../__tests__/helpers/createTestDiagram";
import { ElementTypes } from "../../../story/domain/elementTypes";
import type { DomainStoryDocument } from "../../../story/domain/DomainStoryDocument";
import type {
    ColorPickerHandle,
    ColorPickerProvider,
    ColorPickerRequest,
} from "../ColorPickerProvider";

function groupStory(title = "picker story"): DomainStoryDocument {
    return {
        iconSet: { name: "", actors: {}, workObjects: {} },
        domainStory: {
            businessObjects: [
                {
                    id: "Group_same_id",
                    type: ElementTypes.GROUP,
                    name: "Scope",
                    x: 100,
                    y: 100,
                    width: 300,
                    height: 200,
                },
            ],
            title,
            description: "",
            version: "4.0.0",
        },
    };
}

function probe(): {
    module: ModuleDeclaration;
    current(): {
        commandStack: CommandStack;
        contextPad: ContextPad;
        elementRegistry: ElementRegistry;
        selection: Selection;
    };
} {
    let current:
        | {
              commandStack: CommandStack;
              contextPad: ContextPad;
              elementRegistry: ElementRegistry;
              selection: Selection;
          }
        | undefined;

    function capture(
        commandStack: CommandStack,
        contextPad: ContextPad,
        elementRegistry: ElementRegistry,
        selection: Selection,
    ) {
        current = { commandStack, contextPad, elementRegistry, selection };
    }
    capture.$inject = [
        "commandStack",
        "contextPad",
        "elementRegistry",
        "selection",
    ];

    return {
        module: { __init__: [capture] },
        current: () => {
            if (!current) throw new Error("probe was not injected");
            return current;
        },
    };
}

interface PendingPicker {
    readonly request: ColorPickerRequest;
    readonly dispose: ReturnType<typeof vi.fn>;
    resolve(result: string | null): void;
}

function providerHarness(): {
    provider: ColorPickerProvider;
    pending: PendingPicker[];
} {
    const pending: PendingPicker[] = [];
    const provider: ColorPickerProvider = (request) => {
        let resolve!: (result: string | null) => void;
        const result = new Promise<string | null>((done) => {
            resolve = done;
        });
        const dispose = vi.fn();
        const handle: ColorPickerHandle = { result, dispose };
        pending.push({ request, resolve, dispose });
        return handle;
    };
    return { provider, pending };
}

function openPicker(services: ReturnType<typeof probe>) {
    const current = services.current();
    const group = current.elementRegistry.get("Group_same_id") as Element;
    current.selection.select(group);
    const entry = current.contextPad.getEntries(group)["colorChange"];
    (entry.action as any).click({ clientX: 420, clientY: 180 }, group);
}

function exportedColor(diagram: TestDiagram): string | undefined {
    return (diagram.client.export().domainStory.businessObjects[0] as any)
        .pickedColor;
}

async function settled(): Promise<void> {
    await Promise.resolve();
    await Promise.resolve();
}

describe("client-scoped color picker providers", () => {
    const diagrams: TestDiagram[] = [];
    const hosts: HTMLElement[] = [];

    afterEach(() => {
        diagrams.splice(0).forEach((diagram) => diagram.cleanup());
        hosts.splice(0).forEach((host) => host.remove());
        vi.restoreAllMocks();
    });

    it("passes copied request data and cancellation leaves persistence/history unchanged", async () => {
        const services = probe();
        const picker = providerHarness();
        const diagram = await createTestDiagram(
            { colorPicker: picker.provider },
            [services.module],
        );
        diagrams.push(diagram);
        diagram.client.import(groupStory());
        const storyChanged = vi.fn();
        diagram.client.on("story.changed", storyChanged);
        openPicker(services);

        const pending = picker.pending[0];
        expect(pending.request).toMatchObject({
            color: "#000000",
            elementIds: ["Group_same_id"],
            anchor: { x: 420, y: 180 },
        });
        expect(pending.request.signal.aborted).toBe(false);
        pending.resolve(null);
        await settled();

        expect(pending.request.signal.aborted).toBe(true);
        expect(pending.dispose).toHaveBeenCalledTimes(1);
        expect(exportedColor(diagram)).toBeUndefined();
        expect(services.current().commandStack.canUndo()).toBe(false);
        await new Promise((resolve) => setTimeout(resolve, 250));
        expect(storyChanged).not.toHaveBeenCalled();
    });

    it("isolates concurrent providers with matching ids and preserves undo", async () => {
        const firstProbe = probe();
        const secondProbe = probe();
        const firstPicker = providerHarness();
        const secondPicker = providerHarness();
        const first = await createTestDiagram(
            { colorPicker: firstPicker.provider },
            [firstProbe.module],
        );
        const second = await createTestDiagram(
            { colorPicker: secondPicker.provider },
            [secondProbe.module],
        );
        diagrams.push(first, second);
        first.client.import(groupStory("first"));
        second.client.import(groupStory("second"));
        openPicker(firstProbe);
        openPicker(secondProbe);

        firstPicker.pending[0].resolve("#ff0000");
        secondPicker.pending[0].resolve(null);
        await settled();

        expect(exportedColor(first)).toBe("#ff0000");
        expect(exportedColor(second)).toBeUndefined();
        expect(firstProbe.current().commandStack.canUndo()).toBe(true);
        expect(secondProbe.current().commandStack.canUndo()).toBe(false);

        firstProbe.current().commandStack.undo();
        expect(exportedColor(first)).toBeUndefined();
        expect(exportedColor(second)).toBeUndefined();
    });

    it("isolates concurrent providers when clients share a host", async () => {
        const host = document.createElement("div");
        host.style.width = "800px";
        host.style.height = "600px";
        document.body.appendChild(host);
        hosts.push(host);
        const firstProbe = probe();
        const secondProbe = probe();
        const firstPicker = providerHarness();
        const secondPicker = providerHarness();
        const first = await createTestDiagram(
            { colorPicker: firstPicker.provider },
            [firstProbe.module],
            host,
        );
        const second = await createTestDiagram(
            { colorPicker: secondPicker.provider },
            [secondProbe.module],
            host,
        );
        diagrams.push(first, second);
        first.client.import(groupStory("first shared"));
        second.client.import(groupStory("second shared"));
        openPicker(firstProbe);
        openPicker(secondProbe);

        firstPicker.pending[0].resolve("#11223344");
        secondPicker.pending[0].resolve("rgba(5, 6, 7, .5)");
        await settled();

        expect(exportedColor(first)).toBe("#11223344");
        expect(exportedColor(second)).toBe("rgba(5, 6, 7, .5)");
        expect(firstPicker.pending[0].dispose).toHaveBeenCalledTimes(1);
        expect(secondPicker.pending[0].dispose).toHaveBeenCalledTimes(1);
    });

    it("retains a request across failed import and disposes on promotion and destroy", async () => {
        const services = probe();
        const picker = providerHarness();
        const diagram = await createTestDiagram(
            { colorPicker: picker.provider },
            [services.module],
        );
        diagrams.push(diagram);
        diagram.client.import(groupStory());
        openPicker(services);
        const first = picker.pending[0];

        expect(() =>
            diagram.client.import({} as DomainStoryDocument),
        ).toThrow();
        expect(first.request.signal.aborted).toBe(false);
        expect(first.dispose).not.toHaveBeenCalled();

        diagram.client.import(groupStory("replacement"));
        expect(first.request.signal.aborted).toBe(true);
        expect(first.dispose).toHaveBeenCalledTimes(1);

        openPicker(services);
        const second = picker.pending[1];
        diagram.client.destroy();
        expect(second.request.signal.aborted).toBe(true);
        expect(second.dispose).toHaveBeenCalledTimes(1);

        second.resolve("#00ff00");
        await settled();
        expect(second.dispose).toHaveBeenCalledTimes(1);
    });
});
