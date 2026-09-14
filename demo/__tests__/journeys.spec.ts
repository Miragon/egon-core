import { test, expect } from "./fixtures";
import type { Locator, Page } from "@playwright/test";
import {
    activityIds,
    activityNumber,
    canvas,
    clickDiagramElement,
    connectThroughContextPad,
    createShape,
    diagramElement,
    editInlineLabel,
    exportStory,
    hitTarget,
    openActivityPopup,
    openDemo,
    type ExportedElement,
    type ExportedStory,
} from "./helpers";

const primaryModifier = process.platform === "darwin" ? "Meta" : "Control";

async function dragSlider(
    page: Page,
    slider: Locator,
    from: { left: number; top: number },
    to: { left: number; top: number },
) {
    const bounds = await slider.boundingBox();
    if (!bounds) throw new Error("Could not measure color picker slider.");
    await page.mouse.move(
        bounds.x + bounds.width * from.left,
        bounds.y + bounds.height * from.top,
    );
    await page.mouse.down();
    await page.mouse.move(
        bounds.x + bounds.width * to.left,
        bounds.y + bounds.height * to.top,
    );
    await page.mouse.up();
}

test.beforeEach(async ({ page }) => {
    await openDemo(page);
});

test("draw and number", async ({ page }) => {
    const actor = await createShape(page, "Create Person", { x: 180, y: 150 });
    const first = await createShape(page, "Create Document", {
        x: 470,
        y: 130,
    });
    const second = await createShape(page, "Create Document", {
        x: 470,
        y: 340,
    });

    const activityOne = await connectThroughContextPad(page, actor, first);
    const activityTwo = await connectThroughContextPad(page, actor, second);

    await expect(activityNumber(page, activityOne)).toHaveText("1");
    await expect(activityNumber(page, activityTwo)).toHaveText("2");
});

test("connect, renumber, undo and redo", async ({ page }) => {
    const actor = await createShape(page, "Create Person", { x: 170, y: 180 });
    const first = await createShape(page, "Create Document", {
        x: 500,
        y: 120,
    });
    const second = await createShape(page, "Create Document", {
        x: 500,
        y: 350,
    });
    const activityOne = await connectThroughContextPad(page, actor, first);
    const activityTwo = await connectThroughContextPad(page, actor, second);

    const popup = await openActivityPopup(page, activityTwo);
    await popup.locator('input[name="index"]').fill("1");
    await popup.getByRole("button", { name: "Update" }).click();
    await expect(activityNumber(page, activityOne)).toHaveText("2");
    await expect(activityNumber(page, activityTwo)).toHaveText("1");

    // diagram-js binds keyboard commands to the canvas SVG, so return focus
    // there after the popup button was removed from the document.
    await canvas(page)
        .locator(".djs-container > svg")
        .click({
            position: { x: 800, y: 500 },
        });
    await page.keyboard.press(`${primaryModifier}+z`);
    await expect(activityNumber(page, activityOne)).toHaveText("1");
    await expect(activityNumber(page, activityTwo)).toHaveText("2");
    await page.keyboard.press(`${primaryModifier}+Shift+z`);
    await expect(activityNumber(page, activityOne)).toHaveText("2");
    await expect(activityNumber(page, activityTwo)).toHaveText("1");

    await page.keyboard.press(`${primaryModifier}+z`);
    await page.keyboard.press(`${primaryModifier}+z`);
    await expect(diagramElement(page, activityTwo)).toHaveCount(0);
    await expect(activityNumber(page, activityOne)).toHaveText("1");

    await page.keyboard.press(`${primaryModifier}+Shift+z`);
    await expect(diagramElement(page, activityTwo)).toBeVisible();
    await expect(activityNumber(page, activityTwo)).toHaveText("2");
    await page.keyboard.press(`${primaryModifier}+Shift+z`);
    await expect(activityNumber(page, activityOne)).toHaveText("2");
    await expect(activityNumber(page, activityTwo)).toHaveText("1");
});

test("edit labels and choose an autocomplete suggestion", async ({ page }) => {
    const actor = await createShape(page, "Create Person", { x: 160, y: 170 });
    const seeded = await createShape(page, "Create Document", {
        x: 470,
        y: 120,
    });
    const target = await createShape(page, "Create Document", {
        x: 470,
        y: 350,
    });
    const activity = await connectThroughContextPad(page, actor, seeded);

    await editInlineLabel(page, actor, "Customer");
    await editInlineLabel(page, seeded, "Invoice");

    const popup = await openActivityPopup(page, activity);
    await popup.locator('input[name="label"]').fill("creates");
    await popup.getByRole("button", { name: "Update" }).click();

    await hitTarget(diagramElement(page, target)).dblclick({ force: true });
    const editor = page.locator(".djs-direct-editing-content");
    await expect(editor).toBeVisible();
    await editor.fill("Inv");
    const suggestion = page.locator("#autocomplete-list > div", {
        hasText: "Invoice",
    });
    await expect(suggestion).toBeVisible();
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");

    await expect(diagramElement(page, actor)).toContainText("Customer");
    await expect(diagramElement(page, seeded)).toContainText("Invoice");
    await expect(diagramElement(page, activity)).toContainText("creates");
    await expect(diagramElement(page, target)).toContainText("Invoice");
});

test("recolor with the built-in picker and undo/redo beside diagram-js UI", async ({
    page,
}) => {
    const pageErrors: Error[] = [];
    page.on("pageerror", (error) => pageErrors.push(error));
    const actor = await createShape(page, "Create Person", {
        x: 220,
        y: 180,
    });
    // Move selection ownership away from the actor first. Clicking the sole
    // just-created shape toggles diagram-js's retained create selection off.
    await createShape(page, "Create Document", { x: 500, y: 180 });
    await clickDiagramElement(page, actor);
    const origin = page.getByTitle("Change color");
    await expect(origin).toBeVisible();
    await origin.click();

    const picker = page.getByRole("dialog", { name: "Change color" });
    await expect(picker).toBeVisible();
    await expect(picker.getByRole("slider")).toHaveCount(3);
    await expect(picker).toContainText(
        "Custom non-SVG artwork retains its original colors.",
    );
    const input = picker.getByLabel("Hex color");
    await expect(input).toBeFocused();
    const saturation = picker.getByRole("slider", { name: "Color" });
    const hue = picker.getByRole("slider", { name: "Hue" });
    const alpha = picker.getByRole("slider", { name: "Alpha" });
    await dragSlider(
        page,
        saturation,
        { left: 0.2, top: 0.8 },
        { left: 0.8, top: 0.2 },
    );
    await expect(saturation).toHaveAttribute(
        "aria-valuetext",
        "Saturation 80%, Brightness 80%",
    );
    await expect(input).not.toHaveValue("#000000");
    const afterSaturation = await input.inputValue();
    await dragSlider(
        page,
        hue,
        { left: 0.1, top: 0.5 },
        { left: 0.65, top: 0.5 },
    );
    await expect(hue).toHaveAttribute("aria-valuenow", "234");
    await expect(input).not.toHaveValue(afterSaturation);
    const afterHue = await input.inputValue();
    await dragSlider(
        page,
        alpha,
        { left: 0.9, top: 0.5 },
        { left: 0.25, top: 0.5 },
    );
    await expect(alpha).toHaveAttribute("aria-valuenow", "25");
    await expect(input).not.toHaveValue(afterHue);
    await expect(input).toHaveValue(/40$/);
    expect(pageErrors).toEqual([]);

    const apply = picker.getByRole("button", { name: "Apply" });
    await input.fill("#");
    await expect(apply).toBeDisabled();
    await input.fill("#36a8");
    await expect(apply).toBeEnabled();
    await apply.click();
    await expect(picker).toHaveCount(0);
    await expect(origin).toBeFocused();

    const colored = await exportStory(page);
    expect(
        colored.domainStory.businessObjects.find(
            (element) => element.id === actor,
        ),
    ).toMatchObject({ pickedColor: "#36a8" });

    await canvas(page)
        .locator(".djs-container > svg")
        .click({ position: { x: 800, y: 500 } });
    await page.keyboard.press(`${primaryModifier}+z`);
    const undone = await exportStory(page);
    expect(
        undone.domainStory.businessObjects.find(
            (element) => element.id === actor,
        ),
    ).not.toHaveProperty("pickedColor");
    await canvas(page)
        .locator(".djs-container > svg")
        .click({ position: { x: 800, y: 500 } });
    await page.keyboard.press(`${primaryModifier}+Shift+z`);
    const redone = await exportStory(page);
    expect(
        redone.domainStory.businessObjects.find(
            (element) => element.id === actor,
        ),
    ).toMatchObject({ pickedColor: "#36a8" });
    await clickDiagramElement(page, actor);
    await expect(page.getByTitle("Change color")).toBeVisible();
    expect(pageErrors).toEqual([]);
});

test("export, reset, import and report malformed JSON", async ({ page }) => {
    const actor = await createShape(page, "Create Person", { x: 170, y: 190 });
    const workObject = await createShape(page, "Create Document", {
        x: 500,
        y: 190,
    });
    const activity = await connectThroughContextPad(page, actor, workObject);
    await editInlineLabel(page, actor, "Clerk");
    await editInlineLabel(page, workObject, "Order");
    const popup = await openActivityPopup(page, activity);
    await popup.locator('input[name="label"]').fill("records");
    await popup.getByRole("button", { name: "Update" }).click();

    const original = await exportStory(page);
    const originalJson = JSON.stringify(original, null, 2);

    await page.getByRole("button", { name: "New story" }).click();
    await expect(page.getByRole("status")).toHaveText("New empty story ready.");
    await expect(canvas(page).locator("g.djs-element.djs-shape")).toHaveCount(
        0,
    );
    await expect(activityIds(page)).resolves.toHaveLength(0);
    await expect(page.getByLabel("Story JSON")).toHaveValue(originalJson);

    await page.getByLabel("Story JSON").fill("{ definitely not JSON");
    await page.getByRole("button", { name: "Import JSON" }).click();
    await expect(page.getByRole("status")).toContainText(
        "Could not import JSON:",
    );

    await page.getByLabel("Story JSON").fill(originalJson);
    await page.getByRole("button", { name: "Import JSON" }).click();
    await expect(page.getByRole("status")).toHaveText(
        "Story imported from the JSON panel.",
    );
    await expect(canvas(page)).toContainText("Clerk");
    await expect(canvas(page)).toContainText("Order");
    await expect(canvas(page)).toContainText("records");
    await expect(canvas(page).locator("text.djs-labelNumber")).toHaveText("1");

    const roundTripped = await exportStory(page);
    expect(semanticStory(roundTripped)).toEqual(semanticStory(original));
});

function semanticStory(story: ExportedStory) {
    return {
        elements: story.domainStory.businessObjects
            .map((element: ExportedElement) => ({
                id: element.id,
                type: element.type,
                name: element.name ?? "",
                number: element.number ?? null,
                source: element.source ?? null,
                target: element.target ?? null,
            }))
            .sort((left, right) => left.id.localeCompare(right.id)),
        icons: {
            name: story.iconSet.name,
            actors: Object.entries(story.iconSet.actors).sort(
                ([left], [right]) => left.localeCompare(right),
            ),
            workObjects: Object.entries(story.iconSet.workObjects).sort(
                ([left], [right]) => left.localeCompare(right),
            ),
        },
    };
}
