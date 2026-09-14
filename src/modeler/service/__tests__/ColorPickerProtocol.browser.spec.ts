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

function openPicker(diagram: TestDiagram, services: ReturnType<typeof probe>) {
    const current = services.current();
    const group = current.elementRegistry.get("Group_same_id") as Element;
    let request: { requestId: string; color: string } | undefined;
    const requested = (next: { requestId: string; color: string }) => {
        request = next;
    };
    diagram.client.on("colorPicker.requested", requested);
    current.selection.select(group);
    const entry = current.contextPad.getEntries(group)["colorChange"];
    (entry.action as any).click({}, group);
    diagram.client.off("colorPicker.requested", requested);
    if (!request) throw new Error("color picker request was not emitted");
    return { group, request };
}

function renderedStroke(diagram: TestDiagram): string {
    const rect = diagram.container.querySelector<SVGRectElement>(
        '[data-element-id="Group_same_id"] .djs-visual rect',
    )!;
    return getComputedStyle(rect).stroke;
}

function exportedColor(diagram: TestDiagram): string | undefined {
    return (diagram.client.export().domainStory.businessObjects[0] as any)
        .pickedColor;
}

describe("client-scoped color picker protocol", () => {
    const diagrams: TestDiagram[] = [];

    afterEach(() => {
        diagrams.splice(0).forEach((diagram) => diagram.cleanup());
        vi.restoreAllMocks();
    });

    it("previews repeatedly without persistence/history and cancel restores appearance", async () => {
        const services = probe();
        const diagram = await createTestDiagram({}, [services.module]);
        diagrams.push(diagram);
        diagram.client.import(groupStory());
        const storyChanged = vi.fn();
        diagram.client.on("story.changed", storyChanged);
        const { request } = openPicker(diagram, services);

        expect(
            diagram.client.previewPickedColor(request.requestId, "#ff0000"),
        ).toBe(true);
        expect(renderedStroke(diagram)).toBe("rgb(255, 0, 0)");
        expect(
            diagram.client.previewPickedColor(request.requestId, "#00ff00"),
        ).toBe(true);
        expect(renderedStroke(diagram)).toBe("rgb(0, 255, 0)");
        expect(exportedColor(diagram)).toBeUndefined();
        expect(services.current().commandStack.canUndo()).toBe(false);

        expect(diagram.client.cancelColorPicker(request.requestId)).toBe(true);
        expect(renderedStroke(diagram)).toBe("rgb(0, 0, 0)");
        expect(exportedColor(diagram)).toBeUndefined();
        expect(services.current().commandStack.canUndo()).toBe(false);
        await new Promise((resolve) => setTimeout(resolve, 250));
        expect(storyChanged).not.toHaveBeenCalled();
    });

    it("isolates matching element ids, previews, exports, and undo stacks", async () => {
        const firstProbe = probe();
        const secondProbe = probe();
        const first = await createTestDiagram({}, [firstProbe.module]);
        const second = await createTestDiagram({}, [secondProbe.module]);
        diagrams.push(first, second);
        first.client.import(groupStory("first"));
        second.client.import(groupStory("second"));
        const firstRequest = openPicker(first, firstProbe).request;
        const secondRequest = openPicker(second, secondProbe).request;

        expect(
            first.client.previewPickedColor(firstRequest.requestId, "#ff0000"),
        ).toBe(true);
        expect(
            second.client.previewPickedColor(
                secondRequest.requestId,
                "#0000ff",
            ),
        ).toBe(true);
        expect(renderedStroke(first)).toBe("rgb(255, 0, 0)");
        expect(renderedStroke(second)).toBe("rgb(0, 0, 255)");
        expect(exportedColor(first)).toBeUndefined();
        expect(exportedColor(second)).toBeUndefined();

        expect(
            first.client.confirmPickedColor(firstRequest.requestId, "#ff0000"),
        ).toBe(true);
        expect(second.client.cancelColorPicker(secondRequest.requestId)).toBe(
            true,
        );
        expect(exportedColor(first)).toBe("#ff0000");
        expect(exportedColor(second)).toBeUndefined();
        expect(firstProbe.current().commandStack.canUndo()).toBe(true);
        expect(secondProbe.current().commandStack.canUndo()).toBe(false);

        firstProbe.current().commandStack.undo();
        expect(exportedColor(first)).toBeUndefined();
        expect(exportedColor(second)).toBeUndefined();
    });

    it("preserves requests across failed import, closes on promotion, and rejects after destroy", async () => {
        const services = probe();
        const diagram = await createTestDiagram({}, [services.module]);
        diagrams.push(diagram);
        diagram.client.import(groupStory());
        const closed = vi.fn();
        diagram.client.on("colorPicker.closed", closed);
        const { request } = openPicker(diagram, services);

        expect(() =>
            diagram.client.import({} as DomainStoryDocument),
        ).toThrow();
        expect(
            diagram.client.previewPickedColor(request.requestId, "#ff0000"),
        ).toBe(true);
        expect(closed).not.toHaveBeenCalled();

        diagram.client.import(groupStory("replacement"));
        expect(closed).toHaveBeenCalledWith({ requestId: request.requestId });
        expect(
            diagram.client.previewPickedColor(request.requestId, "#00ff00"),
        ).toBe(false);

        diagram.client.destroy();
        expect(
            diagram.client.confirmPickedColor(request.requestId, "#00ff00"),
        ).toBe(false);
        expect(diagram.client.cancelColorPicker(request.requestId)).toBe(false);
        expect(closed).toHaveBeenCalledTimes(1);
    });
});
