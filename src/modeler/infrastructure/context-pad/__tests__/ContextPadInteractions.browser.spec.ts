import "diagram-js/assets/diagram-js.css";
import "../../../../styles.scss";

import { afterEach, describe, expect, it, vi } from "vitest";
import { page, userEvent } from "@vitest/browser/context";
import type { Connection, Element, Shape } from "diagram-js/lib/model/Types";

import {
    createTestModeler,
    type TestModeler,
} from "../../../../__tests__/helpers/createTestModeler";
import {
    addActor,
    addWorkObject,
    connect,
} from "../../../../__tests__/helpers/storyBuilder";
import { ElementTypes } from "../../../../story/domain/elementTypes";
import { TEST_ICON_NAMES } from "../../../../__tests__/helpers/testIconSet";

function hitTarget(modeler: TestModeler, element: Element): SVGElement {
    return modeler.container.querySelector(
        `[data-element-id="${element.id}"] .djs-hit`,
    )!;
}

async function openPad(modeler: TestModeler, element: Element) {
    await userEvent.click(hitTarget(modeler, element), {
        force: true,
    } as never);
    await expect
        .poll(() => modeler.get<any>("contextPad").isOpen(element))
        .toBe(true);
    return modeler.container.querySelector<HTMLElement>(
        ".djs-context-pad.open",
    )!;
}

async function clickEntry(
    modeler: TestModeler,
    element: Element,
    action: string,
) {
    const pad = await openPad(modeler, element);
    const entry = pad.querySelector<HTMLElement>(`[data-action="${action}"]`);
    expect(entry, `missing context-pad action ${action}`).not.toBeNull();
    await userEvent.click(entry!);
}

function elementsOfType<T extends Element>(
    modeler: TestModeler,
    type: string,
): T[] {
    return modeler.elementRegistry
        .getAll()
        .filter((element) => element["type"] === type) as T[];
}

describe("context-pad DOM interactions", () => {
    let modeler: TestModeler | undefined;

    afterEach(async () => {
        await userEvent.cleanup();
        modeler?.cleanup();
        modeler = undefined;
        vi.restoreAllMocks();
    });

    it("appends and places a shape, then connects to an existing target", async () => {
        await page.viewport(1000, 800);
        modeler = createTestModeler();
        const actor = addActor(modeler, { point: { x: 120, y: 120 } });
        const target = addWorkObject(modeler, {
            point: { x: 610, y: 150 },
        });

        const pad = await openPad(modeler, actor);
        const appendEntry = pad.querySelector<HTMLElement>(
            `[data-action="append.workObject${TEST_ICON_NAMES.folder}"]`,
        )!;
        const canvas = modeler.container.querySelector<SVGElement>(
            ".djs-container > svg",
        )!;
        await userEvent.dragAndDrop(appendEntry, canvas, { steps: 10 });

        await expect
            .poll(
                () =>
                    elementsOfType<Shape>(
                        modeler!,
                        `${ElementTypes.WORKOBJECT}${TEST_ICON_NAMES.folder}`,
                    ).length,
            )
            .toBe(1);
        const appended = elementsOfType<Shape>(
            modeler,
            `${ElementTypes.WORKOBJECT}${TEST_ICON_NAMES.folder}`,
        )[0];
        expect(Number.isFinite(appended.x)).toBe(true);
        expect(Number.isFinite(appended.y)).toBe(true);
        expect(appended.x + appended.width / 2).toBeCloseTo(400, -1);
        expect(appended.y + appended.height / 2).toBeCloseTo(300, -1);
        const appendedActivity = elementsOfType<Connection>(
            modeler,
            ElementTypes.ACTIVITY,
        )[0];
        expect(appendedActivity.source).toBe(actor);
        expect(appendedActivity.target).toBe(appended);

        // create.end opens direct editing; close it before the next gesture.
        if (modeler.container.querySelector(".djs-direct-editing-content")) {
            await userEvent.keyboard("{Escape}");
        }
        // diagram-js consumes the first post-drag element click as a ghost-click
        // guard. Drive that documented transition explicitly before starting a
        // distinct context-pad gesture.
        await userEvent.click(hitTarget(modeler, actor), {
            force: true,
        } as never);

        await clickEntry(modeler, actor, "connect");
        await userEvent.click(hitTarget(modeler, target), {
            force: true,
        } as never);
        await expect
            .poll(
                () =>
                    elementsOfType<Connection>(modeler!, ElementTypes.ACTIVITY)
                        .length,
            )
            .toBe(2);
        const activity = elementsOfType<Connection>(
            modeler,
            ElementTypes.ACTIVITY,
        ).find((candidate) => candidate.target === target)!;
        expect(activity.source).toBe(actor);
        expect(activity.target).toBe(target);
    });

    it("deletes a shape and reverses an activity with representative undo", async () => {
        modeler = createTestModeler();
        const actor = addActor(modeler, { point: { x: 120, y: 120 } });
        const target = addWorkObject(modeler, {
            point: { x: 400, y: 120 },
        });
        const disposable = addWorkObject(modeler, {
            point: { x: 400, y: 330 },
        });
        const activity = connect(modeler, actor, target)!;

        await clickEntry(modeler, disposable, "delete");
        expect(modeler.elementRegistry.get(disposable.id)).toBeUndefined();
        modeler.commandStack.undo();
        expect(modeler.elementRegistry.get(disposable.id)).toBe(disposable);

        await clickEntry(modeler, activity, "changeDirection");
        expect(activity.source).toBe(target);
        expect(activity.target).toBe(actor);
        expect(activity.businessObject.number).toBeNull();
        modeler.commandStack.undo();
        expect(activity.source).toBe(actor);
        expect(activity.target).toBe(target);
        expect(activity.businessObject.number).toBe(1);
    });

    it("selects a replacement and applies the host color-picker reply", async () => {
        modeler = createTestModeler();
        const workObject = addWorkObject(modeler, {
            point: { x: 220, y: 150 },
        });

        await clickEntry(modeler, workObject, "replace");
        await expect
            .poll(() =>
                modeler!.container.querySelector<HTMLElement>(
                    '[data-id="replace-with-workobject-folder"]',
                ),
            )
            .not.toBeNull();
        await userEvent.click(
            modeler.container.querySelector<HTMLElement>(
                '[data-id="replace-with-workobject-folder"]',
            )!,
        );
        const replacement = elementsOfType<Shape>(
            modeler,
            `${ElementTypes.WORKOBJECT}${TEST_ICON_NAMES.folder}`,
        )[0];
        expect(replacement).toBeDefined();
        modeler.commandStack.undo();
        expect(modeler.elementRegistry.get(workObject.id)).toBe(workObject);
        modeler.commandStack.redo();

        const openPicker = vi.fn();
        document.addEventListener("openColorPicker", openPicker, {
            once: true,
        });
        await clickEntry(modeler, replacement, "colorChange");
        expect(openPicker).toHaveBeenCalledTimes(1);
        document.dispatchEvent(
            new CustomEvent("pickedColor", {
                detail: { color: "#8844cc" },
            }),
        );

        await expect
            .poll(() => replacement.businessObject.pickedColor)
            .toBe("#8844cc");
        const icon = modeler.container.querySelector<SVGGraphicsElement>(
            `[data-element-id="${replacement.id}"] .djs-visual rect`,
        )!;
        expect(getComputedStyle(icon).fill).toBe("rgb(136, 68, 204)");
        modeler.commandStack.undo();
        expect(replacement.businessObject.pickedColor).toBeUndefined();
    });
});
