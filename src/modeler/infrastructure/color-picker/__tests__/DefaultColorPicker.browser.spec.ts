import "diagram-js/assets/diagram-js.css";
import "../../../../styles.scss";

import { afterEach, describe, expect, it, vi } from "vitest";
import type CommandStack from "diagram-js/lib/command/CommandStack";
import type ElementRegistry from "diagram-js/lib/core/ElementRegistry";
import type ContextPad from "diagram-js/lib/features/context-pad/ContextPad";
import type Selection from "diagram-js/lib/features/selection/Selection";
import type { ModuleDeclaration } from "didi";

import {
    createTestDiagram,
    type TestDiagram,
} from "../../../../__tests__/helpers/createTestDiagram";
import type { DomainStoryDocument } from "../../../../story/domain/DomainStoryDocument";
import { ElementTypes } from "../../../../story/domain/elementTypes";
import type { DirtyFlagService } from "../../../service/DirtyFlagService";

function story(): DomainStoryDocument {
    return {
        iconSet: { name: "", actors: {}, workObjects: {} },
        domainStory: {
            businessObjects: [
                {
                    id: "Group_1",
                    type: ElementTypes.GROUP,
                    name: "One",
                    x: 100,
                    y: 100,
                    width: 200,
                    height: 150,
                },
                {
                    id: "Group_2",
                    type: ElementTypes.GROUP,
                    name: "Two",
                    x: 400,
                    y: 100,
                    width: 200,
                    height: 150,
                    pickedColor: "#12345680",
                },
            ],
            title: "default picker",
            description: "",
            version: "4.0.0",
        },
    };
}

function probe() {
    let services:
        | {
              commandStack: CommandStack;
              contextPad: ContextPad;
              dirty: DirtyFlagService;
              registry: ElementRegistry;
              selection: Selection;
          }
        | undefined;
    function capture(
        commandStack: CommandStack,
        contextPad: ContextPad,
        dirty: DirtyFlagService,
        registry: ElementRegistry,
        selection: Selection,
    ) {
        services = { commandStack, contextPad, dirty, registry, selection };
    }
    capture.$inject = [
        "commandStack",
        "contextPad",
        "domainStoryDirtyFlagService",
        "elementRegistry",
        "selection",
    ];
    return {
        module: { __init__: [capture] } as ModuleDeclaration,
        get: () => {
            if (!services) throw new Error("probe was not injected");
            return services;
        },
    };
}

function setInput(input: HTMLInputElement, value: string): void {
    input.value = value;
    input.dispatchEvent(new Event("input", { bubbles: true }));
}

async function flush(): Promise<void> {
    await Promise.resolve();
    await Promise.resolve();
}

function slider(dialog: HTMLElement, label: string): HTMLElement {
    return dialog.querySelector<HTMLElement>(
        `[role="slider"][aria-label="${label}"]`,
    )!;
}

function point(
    element: HTMLElement,
    left: number,
    top: number,
): { x: number; y: number } {
    const rect = element.getBoundingClientRect();
    return {
        x: rect.left + rect.width * left,
        y: rect.top + rect.height * top,
    };
}

function mouseDrag(
    element: HTMLElement,
    from: { left: number; top: number },
    to: { left: number; top: number },
): void {
    const start = point(element, from.left, from.top);
    const end = point(element, to.left, to.top);
    element.dispatchEvent(
        new MouseEvent("mousedown", {
            bubbles: true,
            buttons: 1,
            cancelable: true,
            clientX: start.x,
            clientY: start.y,
        }),
    );
    window.dispatchEvent(
        new MouseEvent("mousemove", {
            bubbles: true,
            buttons: 1,
            cancelable: true,
            clientX: end.x,
            clientY: end.y,
        }),
    );
    window.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
}

function touchDrag(
    element: HTMLElement,
    from: { left: number; top: number },
    to: { left: number; top: number },
): void {
    const touch = (coordinates: { x: number; y: number }) =>
        new Touch({
            identifier: 1,
            target: element,
            clientX: coordinates.x,
            clientY: coordinates.y,
            pageX: coordinates.x,
            pageY: coordinates.y,
        });
    const start = touch(point(element, from.left, from.top));
    // Preact keeps the prop's casing when desktop Chromium does not expose
    // ontouchstart; touch-capable browsers register the lowercase DOM event.
    const startEvent = "ontouchstart" in element ? "touchstart" : "TouchStart";
    element.dispatchEvent(
        new TouchEvent(startEvent, {
            bubbles: true,
            cancelable: true,
            changedTouches: [start],
            targetTouches: [start],
            touches: [start],
        }),
    );
    const end = touch(point(element, to.left, to.top));
    window.dispatchEvent(
        new TouchEvent("touchmove", {
            bubbles: true,
            cancelable: true,
            changedTouches: [end],
            targetTouches: [end],
            touches: [end],
        }),
    );
    window.dispatchEvent(
        new TouchEvent("touchend", {
            bubbles: true,
            cancelable: true,
            changedTouches: [end],
            targetTouches: [],
            touches: [],
        }),
    );
}

describe("built-in color picker", () => {
    let diagram: TestDiagram | undefined;

    afterEach(() => {
        diagram?.cleanup();
        diagram = undefined;
        document
            .querySelectorAll(".egon-color-picker-mount")
            .forEach((node) => node.remove());
    });

    it("keeps edits as drafts, applies short alpha hex, and supports undo/redo", async () => {
        const services = probe();
        diagram = await createTestDiagram({}, [services.module]);
        diagram.client.import(story());
        const current = services.get();
        current.commandStack.clear();
        current.dirty.makeClean();
        const changed = vi.fn();
        diagram.client.on("story.changed", changed);
        current.selection.select(current.registry.get("Group_1"));
        const origin = diagram.container.querySelector<HTMLButtonElement>(
            'button[data-action="colorChange"]',
        )!;
        origin.focus();
        origin.click();

        const dialog =
            document.querySelector<HTMLElement>(".egon-color-picker")!;
        const input = dialog.querySelector<HTMLInputElement>(
            'input[name="color"]',
        )!;
        const apply = dialog.querySelector<HTMLButtonElement>(
            ".egon-color-picker__apply",
        )!;
        expect(document.activeElement).toBe(input);
        expect(input.value).toBe("#000000");

        setInput(input, "#12");
        await flush();
        expect(apply.disabled).toBe(true);
        expect(current.commandStack.canUndo()).toBe(false);
        expect(current.dirty.dirty).toBe(false);
        expect(changed).not.toHaveBeenCalled();

        setInput(input, "#f008");
        await flush();
        expect(apply.disabled).toBe(false);
        apply.click();
        await flush();

        const exported = () =>
            (diagram!.client.export().domainStory.businessObjects[0] as any)
                .pickedColor;
        expect(exported()).toBe("#f008");
        expect(current.commandStack.canUndo()).toBe(true);
        if (origin.isConnected) expect(document.activeElement).toBe(origin);
        current.commandStack.undo();
        expect(exported()).toBeUndefined();
        current.commandStack.redo();
        expect(exported()).toBe("#f008");
    });

    it("handles mouse and touch slider drafts, cancellation, and undoable apply", async () => {
        const services = probe();
        diagram = await createTestDiagram({}, [services.module]);
        diagram.client.import(story());
        const current = services.get();
        current.commandStack.clear();
        current.dirty.makeClean();
        const changed = vi.fn();
        diagram.client.on("story.changed", changed);
        current.selection.select(current.registry.get("Group_1"));
        const origin = diagram.container.querySelector<HTMLButtonElement>(
            'button[data-action="colorChange"]',
        )!;
        const errors: ErrorEvent[] = [];
        const recordError = (event: ErrorEvent) => errors.push(event);
        window.addEventListener("error", recordError);

        try {
            origin.click();
            let dialog =
                document.querySelector<HTMLElement>(".egon-color-picker")!;
            let input = dialog.querySelector<HTMLInputElement>(
                'input[name="color"]',
            )!;

            mouseDrag(
                slider(dialog, "Color"),
                { left: 0.2, top: 0.8 },
                { left: 0.8, top: 0.2 },
            );
            await vi.waitFor(() => expect(input.value).not.toBe("#000000"));
            const afterSaturation = input.value;

            mouseDrag(
                slider(dialog, "Hue"),
                { left: 0.1, top: 0.5 },
                { left: 0.65, top: 0.5 },
            );
            await vi.waitFor(() =>
                expect(input.value).not.toBe(afterSaturation),
            );
            const afterHue = input.value;

            mouseDrag(
                slider(dialog, "Alpha"),
                { left: 0.9, top: 0.5 },
                { left: 0.25, top: 0.5 },
            );
            await vi.waitFor(() => expect(input.value).not.toBe(afterHue));
            expect(input.value).toHaveLength(9);

            const exported = () =>
                (diagram!.client.export().domainStory.businessObjects[0] as any)
                    .pickedColor;
            expect(exported()).toBeUndefined();
            expect(current.commandStack.canUndo()).toBe(false);
            expect(current.dirty.dirty).toBe(false);
            expect(changed).not.toHaveBeenCalled();
            expect(errors).toEqual([]);

            dialog
                .querySelector<HTMLButtonElement>(
                    ".egon-color-picker__actions button",
                )!
                .click();
            await flush();
            expect(document.querySelector(".egon-color-picker")).toBeNull();
            expect(exported()).toBeUndefined();
            expect(current.commandStack.canUndo()).toBe(false);

            origin.click();
            dialog = document.querySelector<HTMLElement>(".egon-color-picker")!;
            input = dialog.querySelector<HTMLInputElement>(
                'input[name="color"]',
            )!;
            touchDrag(
                slider(dialog, "Color"),
                { left: 0.25, top: 0.75 },
                { left: 0.6, top: 0.2 },
            );
            await vi.waitFor(() => expect(input.value).not.toBe("#000000"));
            const applied = input.value;
            expect(exported()).toBeUndefined();
            expect(current.commandStack.canUndo()).toBe(false);

            dialog
                .querySelector<HTMLButtonElement>(".egon-color-picker__apply")!
                .click();
            await flush();
            expect(exported()).toBe(applied);
            expect(current.commandStack.canUndo()).toBe(true);
            current.commandStack.undo();
            expect(exported()).toBeUndefined();
            current.commandStack.redo();
            expect(exported()).toBe(applied);
            expect(errors).toEqual([]);
        } finally {
            window.removeEventListener("error", recordError);
        }
    });

    it("cancels on Escape and outside interaction with the documented focus behavior", async () => {
        const services = probe();
        diagram = await createTestDiagram({}, [services.module]);
        diagram.client.import(story());
        const current = services.get();
        current.commandStack.clear();
        current.selection.select(current.registry.get("Group_1"));
        const origin = diagram.container.querySelector<HTMLButtonElement>(
            'button[data-action="colorChange"]',
        )!;
        origin.focus();
        origin.click();
        const input = document.querySelector<HTMLInputElement>(
            '.egon-color-picker input[name="color"]',
        )!;
        setInput(input, "#00ff00");
        document.dispatchEvent(
            new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
        );
        await flush();
        expect(document.querySelector(".egon-color-picker")).toBeNull();
        if (origin.isConnected) expect(document.activeElement).toBe(origin);
        expect(current.commandStack.canUndo()).toBe(false);

        origin.click();
        const outside = document.createElement("button");
        outside.textContent = "Outside";
        document.body.appendChild(outside);
        outside.dispatchEvent(
            new PointerEvent("pointerdown", { bubbles: true }),
        );
        outside.focus();
        await flush();
        expect(document.querySelector(".egon-color-picker")).toBeNull();
        expect(document.activeElement).toBe(outside);
        expect(current.commandStack.canUndo()).toBe(false);
        outside.remove();
    });

    it("uses the black multi-selection default and exposes keyboard sliders and artwork guidance", async () => {
        const services = probe();
        diagram = await createTestDiagram({}, [services.module]);
        diagram.client.import(story());
        const current = services.get();
        current.selection.select([
            current.registry.get("Group_1"),
            current.registry.get("Group_2"),
        ]);
        diagram.container
            .querySelector<HTMLButtonElement>(
                'button[data-action="colorChange"]',
            )!
            .click();

        const dialog =
            document.querySelector<HTMLElement>(".egon-color-picker")!;
        expect(
            dialog.querySelector<HTMLInputElement>('input[name="color"]')!
                .value,
        ).toBe("#000000");
        expect(dialog.querySelectorAll('[role="slider"]')).toHaveLength(3);
        expect(dialog.textContent).toContain(
            "Custom non-SVG artwork retains its original colors.",
        );
        const slider = dialog.querySelector<HTMLElement>('[role="slider"]')!;
        slider.focus();
        slider.dispatchEvent(
            new KeyboardEvent("keydown", {
                key: "ArrowRight",
                keyCode: 39,
                bubbles: true,
            }),
        );
        expect(document.activeElement).toBe(slider);
    });

    it("flips and clamps the popover at the viewport edge", async () => {
        const services = probe();
        diagram = await createTestDiagram({}, [services.module]);
        diagram.client.import(story());
        const current = services.get();
        current.selection.select(current.registry.get("Group_1"));
        const origin = diagram.container.querySelector<HTMLButtonElement>(
            'button[data-action="colorChange"]',
        )!;
        vi.spyOn(origin, "getBoundingClientRect").mockReturnValue({
            left: window.innerWidth - 34,
            right: window.innerWidth - 4,
            top: 2,
            bottom: 22,
            width: 30,
            height: 20,
            x: window.innerWidth - 34,
            y: 2,
            toJSON: () => undefined,
        });
        origin.click();

        const mount = document.querySelector<HTMLElement>(
            ".egon-color-picker-mount",
        )!;
        const dialog = mount.firstElementChild as HTMLElement;
        vi.spyOn(dialog, "getBoundingClientRect").mockReturnValue({
            left: 0,
            right: 240,
            top: 0,
            bottom: 200,
            width: 240,
            height: 200,
            x: 0,
            y: 0,
            toJSON: () => undefined,
        });
        window.dispatchEvent(new Event("resize"));

        expect(mount.style.left).toBe(`${window.innerWidth - 252}px`);
        expect(mount.style.top).toBe("8px");
    });
});
