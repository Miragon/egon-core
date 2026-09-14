import { test, expect } from "./fixtures";
import {
    activityIds,
    activityNumber,
    canvas,
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
