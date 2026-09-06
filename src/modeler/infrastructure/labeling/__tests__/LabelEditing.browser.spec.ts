import "diagram-js/assets/diagram-js.css";
import "../../../../styles.scss";

import { afterEach, describe, expect, it } from "vitest";
import { userEvent } from "@vitest/browser/context";
import type { Element } from "diagram-js/lib/model/Types";

import {
    createTestModeler,
    type TestModeler,
} from "../../../../__tests__/helpers/createTestModeler";
import {
    addActor,
    addAnnotation,
    addWorkObject,
    connect,
} from "../../../../__tests__/helpers/storyBuilder";

function graphics(modeler: TestModeler, element: Element): SVGElement {
    return modeler.container.querySelector(
        `[data-element-id="${element.id}"] .djs-visual`,
    )!;
}

function hitTarget(modeler: TestModeler, element: Element): SVGElement {
    return modeler.container.querySelector(
        `[data-element-id="${element.id}"] .djs-hit`,
    )!;
}

function labelText(modeler: TestModeler, element: Element): string {
    return Array.from(graphics(modeler, element).querySelectorAll("text"))
        .map((text) => text.textContent?.replace(/\s+/g, " ").trim())
        .filter(Boolean)
        .join(" ");
}

async function openInlineEditor(modeler: TestModeler, element: Element) {
    await userEvent.dblClick(hitTarget(modeler, element), {
        force: true,
    } as never);
    await expect
        .poll(() =>
            modeler.container.querySelector<HTMLElement>(
                ".djs-direct-editing-content",
            ),
        )
        .not.toBeNull();
    await expect
        .poll(() => document.activeElement?.className)
        .toContain("djs-direct-editing-content");
    return modeler.container.querySelector<HTMLElement>(
        ".djs-direct-editing-content",
    )!;
}

async function openActivityPopup(modeler: TestModeler, element: Element) {
    await userEvent.dblClick(hitTarget(modeler, element), {
        force: true,
    } as never);
    await expect
        .poll(() =>
            modeler.container.querySelector<HTMLElement>(
                "[data-numbering-popup]",
            ),
        )
        .not.toBeNull();
    return modeler.container.querySelector<HTMLElement>(
        "[data-numbering-popup]",
    )!;
}

function popupButton(popup: HTMLElement, name: string): HTMLButtonElement {
    return Array.from(popup.querySelectorAll("button")).find(
        (button) => button.textContent?.trim() === name,
    )!;
}

describe("canvas label editing", () => {
    let modeler: TestModeler | undefined;

    afterEach(async () => {
        await userEvent.cleanup();
        modeler?.cleanup();
        modeler = undefined;
    });

    it("commits actor and annotation labels and cancels a work-object edit", async () => {
        modeler = createTestModeler();
        const actor = addActor(modeler, { point: { x: 120, y: 120 } });
        const workObject = addWorkObject(modeler, {
            point: { x: 350, y: 120 },
            name: "Original",
        });
        const annotation = addAnnotation(modeler, {
            point: { x: 300, y: 310 },
        });

        const actorEditor = await openInlineEditor(modeler, actor);
        await userEvent.type(actorEditor, "Buyer");
        await userEvent.keyboard("{Enter}");
        await expect.poll(() => actor.businessObject.name).toBe("Buyer");
        expect(labelText(modeler, actor)).toContain("Buyer");

        const workObjectEditor = await openInlineEditor(modeler, workObject);
        await userEvent.fill(workObjectEditor, "Discarded");
        await userEvent.keyboard("{Escape}");
        await expect
            .poll(() =>
                modeler!.container.querySelector(".djs-direct-editing-content"),
            )
            .toBeNull();
        expect(workObject.businessObject.name).toBe("Original");
        expect(labelText(modeler, workObject)).toContain("Original");

        const annotationEditor = await openInlineEditor(modeler, annotation);
        const editingBounds = annotationEditor.getBoundingClientRect();
        expect(editingBounds.width).toBeGreaterThan(0);
        expect(editingBounds.height).toBeGreaterThan(0);
        await userEvent.fill(annotationEditor, "first line\nsecond line");
        await userEvent.keyboard("{Enter}");
        await expect
            .poll(() => annotation.businessObject.text)
            .toBe("first line\nsecond line");
        expect(labelText(modeler, annotation)).toContain("first line");
        expect(labelText(modeler, annotation)).toContain("second line");
        expect(annotation.width).toBeGreaterThan(0);
        expect(annotation.height).toBeGreaterThan(0);
    });

    it("edits numbered and response activities through their popup", async () => {
        modeler = createTestModeler();
        const actor = addActor(modeler, { point: { x: 100, y: 120 } });
        const first = addWorkObject(modeler, {
            point: { x: 350, y: 120 },
        });
        const second = addWorkObject(modeler, {
            point: { x: 600, y: 120 },
        });
        const numbered = connect(modeler, actor, first)!;
        const response = connect(modeler, first, second)!;
        const originalNumber = numbered.businessObject.number;

        let popup = await openActivityPopup(modeler, numbered);
        const labelInput = popup.querySelector<HTMLInputElement>(
            'input[name="label"]',
        )!;
        await userEvent.type(labelInput, "orders");
        await userEvent.click(popupButton(popup, "Update"));

        expect(numbered.businessObject.name).toBe("orders");
        expect(numbered.businessObject.number).toBe(originalNumber);
        expect(labelText(modeler, numbered)).toContain("orders");
        expect(
            graphics(modeler, numbered).querySelector("text.djs-labelNumber")
                ?.textContent,
        ).toBe(String(originalNumber));

        modeler.commandStack.undo();
        expect(numbered.businessObject.name).toBe("");
        expect(numbered.businessObject.number).toBe(originalNumber);
        modeler.commandStack.redo();
        expect(numbered.businessObject.name).toBe("orders");
        expect(numbered.businessObject.number).toBe(originalNumber);

        popup = await openActivityPopup(modeler, numbered);
        await userEvent.fill(
            popup.querySelector<HTMLInputElement>('input[name="label"]')!,
            "cancelled",
        );
        await userEvent.click(popupButton(popup, "Cancel"));
        expect(numbered.businessObject.name).toBe("orders");

        popup = await openActivityPopup(modeler, response);
        expect(popup.querySelector('input[name="index"]')).toBeNull();
        await userEvent.type(
            popup.querySelector<HTMLInputElement>('input[name="label"]')!,
            "confirms",
        );
        await userEvent.click(popupButton(popup, "Update"));
        expect(response.businessObject.name).toBe("confirms");
        expect(response.businessObject.number).toBeNull();
        expect(labelText(modeler, response)).toContain("confirms");
    });

    it("selects autocomplete suggestions through the undoable editor command", async () => {
        modeler = createTestModeler();
        const alpha = addWorkObject(modeler, {
            point: { x: 160, y: 100 },
        });
        const alpine = addWorkObject(modeler, {
            point: { x: 350, y: 100 },
        });
        const target = addWorkObject(modeler, {
            point: { x: 540, y: 100 },
        });
        const actor = addActor(modeler, { point: { x: 160, y: 300 } });

        // Normal modeling commands seed the live label dictionary.
        modeler.modeling.updateLabel(alpha, "Alpha");
        modeler.modeling.updateLabel(alpine, "Alpine");

        let editor = await openInlineEditor(modeler, target);
        await userEvent.type(editor, "Al");
        await expect
            .poll(() =>
                Array.from(
                    modeler!.container.querySelectorAll(
                        "#autocomplete-list > div",
                    ),
                ).map((item) => item.textContent),
            )
            .toEqual(["Alpha", "Alpine"]);

        await userEvent.keyboard("{ArrowUp}");
        expect(
            modeler.container.querySelector(".autocomplete-active")
                ?.textContent,
        ).toBe("Alpine");
        await userEvent.keyboard("{ArrowDown}");
        expect(
            modeler.container.querySelector(".autocomplete-active")
                ?.textContent,
        ).toBe("Alpha");
        await userEvent.keyboard("{Enter}");

        await expect.poll(() => target.businessObject.name).toBe("Alpha");
        modeler.commandStack.undo();
        expect(target.businessObject.name).toBe("");
        modeler.commandStack.redo();
        expect(target.businessObject.name).toBe("Alpha");

        editor = await openInlineEditor(modeler, target);
        await userEvent.fill(editor, "manual");
        await userEvent.keyboard("{Shift>}{Enter}{/Shift}");
        expect(
            modeler.container.querySelector(".djs-direct-editing-content"),
        ).not.toBeNull();
        expect(editor.innerText).toContain("\n");
        await userEvent.keyboard("{Enter}");
        await expect.poll(() => target.businessObject.name).toContain("manual");

        editor = await openInlineEditor(modeler, actor);
        await userEvent.type(editor, "Al");
        expect(
            modeler.container.querySelector("#autocomplete-list"),
        ).toBeNull();
        await userEvent.keyboard("{Enter}");
        expect(actor.businessObject.name).toBe("Al");
        expect(alpha.businessObject.name).toBe("Alpha");
    });
});
