import type { Locator } from "@playwright/test";
import { test, expect } from "./fixtures";
import {
    canvas,
    clickDiagramElement,
    connectThroughContextPad,
    createShape,
    diagramElement,
    hitTarget,
    openDemo,
} from "./helpers";

test.beforeEach(async ({ page }) => {
    await openDemo(page);
});

test("ships diagram-js palette and context-pad layout", async ({ page }) => {
    const palette = canvas(page).locator(".djs-palette");
    await expect(palette).toHaveCSS("position", "absolute");

    const paletteEntry = page.getByTitle("Create Person");
    await expect(paletteEntry).toHaveCSS("width", "46px");
    await expect(paletteEntry).toHaveCSS("height", "46px");

    const actor = await createShape(page, "Create Person", {
        x: 260,
        y: 230,
    });
    const actorElement = diagramElement(page, actor);

    const pad = canvas(page).locator(".djs-context-pad.open");
    await expect(pad).toBeVisible();
    await expect(pad).toHaveCSS("position", "absolute");

    const deleteEntry = pad.getByTitle("Remove");
    await expect(deleteEntry).toHaveCSS("width", "22px");
    await expect(deleteEntry).toHaveCSS("height", "22px");

    const [elementBounds, padBounds, canvasBounds] = await Promise.all([
        actorElement.boundingBox(),
        pad.boundingBox(),
        canvas(page).boundingBox(),
    ]);
    expect(elementBounds).not.toBeNull();
    expect(padBounds).not.toBeNull();
    expect(canvasBounds).not.toBeNull();

    if (!elementBounds || !padBounds || !canvasBounds) {
        throw new Error(
            "Could not measure the selected element and context pad.",
        );
    }

    expect(padBounds.x).toBeGreaterThanOrEqual(elementBounds.x - 2);
    expect(padBounds.x).toBeLessThanOrEqual(
        elementBounds.x + elementBounds.width + 40,
    );
    expect(padBounds.y).toBeLessThan(elementBounds.y + elementBounds.height);
    expect(padBounds.x).toBeGreaterThanOrEqual(canvasBounds.x);
    expect(padBounds.x + padBounds.width).toBeLessThanOrEqual(
        canvasBounds.x + canvasBounds.width,
    );

    // No force option: the base stylesheet must make pad entries hit-testable.
    await deleteEntry.click();
    await expect(actorElement).toHaveCount(0);
});

test("positions direct editing over its element and commits text", async ({
    page,
}) => {
    const workObject = await createShape(page, "Create Document", {
        x: 430,
        y: 260,
    });
    const element = diagramElement(page, workObject);
    await hitTarget(element).dblclick({ force: true });

    const editor = page.locator(".djs-direct-editing-content");
    const editorParent = page.locator(".djs-direct-editing-parent");
    await expect(editor).toBeVisible();
    await expect(editorParent).toHaveCSS("position", "absolute");

    const overlapsElement = await Promise.all([
        element.boundingBox(),
        editorParent.boundingBox(),
    ]).then(([elementBounds, editorBounds]) => {
        if (!elementBounds || !editorBounds) return false;
        return (
            editorBounds.x < elementBounds.x + elementBounds.width &&
            editorBounds.x + editorBounds.width > elementBounds.x &&
            editorBounds.y < elementBounds.y + elementBounds.height &&
            editorBounds.y + editorBounds.height > elementBounds.y
        );
    });
    expect(overlapsElement).toBe(true);

    await editor.fill("Purchase order");
    await page.keyboard.press("Enter");
    await expect(editor).toBeHidden();
    await expect(element).toContainText("Purchase order");
});

test("loads font glyphs, built-in masks, and supplied icons", async ({
    page,
}) => {
    const lasso = page.getByTitle("Activate the lasso tool");
    const fontIcon = await lasso.evaluate((element) => {
        const style = getComputedStyle(element, "::before");
        return {
            content: style.content.replace(/^['"]|['"]$/g, ""),
            family: style.fontFamily,
        };
    });
    expect(fontIcon.content).toBe("\ue862");
    expect(fontIcon.family).toContain("bpmn");

    const fontLoaded = await page.evaluate(async () => {
        await document.fonts.load('16px "bpmn"', "\ue862");
        return document.fonts.check('16px "bpmn"', "\ue862");
    });
    expect(fontLoaded).toBe(true);

    await expectPseudoImage(page.getByTitle("Create group"), "mask-image");
    await expectPseudoImage(page.getByTitle("Create Person"), "mask-image");
    await expectPseudoImage(page.getByTitle("Create Document"), "mask-image");

    const actor = await createShape(page, "Create Person", { x: 250, y: 200 });
    const documentId = await createShape(page, "Create Document", {
        x: 510,
        y: 200,
    });
    await clickDiagramElement(page, actor);
    await expectPseudoImage(page.getByTitle("Change color"), "mask-image");

    await canvas(page).click({ position: { x: 800, y: 500 } });
    await connectThroughContextPad(page, actor, documentId);
    await expectPseudoImage(page.getByTitle("Change direction"), "mask-image");

    for (const id of [actor, documentId]) {
        const icon = diagramElement(page, id)
            .locator(".djs-visual svg")
            .first();
        await expect(icon).toBeVisible();
        expect(
            await icon.evaluate((element) => element.childElementCount),
        ).toBeGreaterThan(0);
    }
});

async function expectPseudoImage(
    locator: Locator,
    property: "background-image" | "mask-image",
) {
    const result = await locator.evaluate(async (element, propertyName) => {
        const style = getComputedStyle(element, "::before");
        let value = style.getPropertyValue(propertyName);
        if (!value || value === "none") {
            value = style.getPropertyValue(`-webkit-${propertyName}`);
        }
        const match = /^url\(["']?(.*?)["']?\)$/.exec(value);
        if (!match?.[1]) return { decoded: false, value };

        const response = await fetch(match[1].replaceAll('\\"', '"'));
        const markup = await response.text();
        const document = new DOMParser().parseFromString(
            markup,
            "image/svg+xml",
        );
        return {
            decoded:
                response.ok &&
                document.documentElement.localName === "svg" &&
                document.querySelector("parsererror") === null,
            value,
        };
    }, property);
    expect(result.value).not.toBe("none");
    expect(result.decoded).toBe(true);
}
