import type { Locator, Page } from "@playwright/test";
import { expect } from "./fixtures";

export type ExportedElement = {
    id: string;
    type: string;
    name?: string;
    number?: number | null;
    source?: string;
    target?: string;
};

export type ExportedStory = {
    iconSet: {
        name: string;
        actors: Record<string, string>;
        workObjects: Record<string, string>;
    };
    domainStory: { businessObjects: ExportedElement[] };
};

export const canvas = (page: Page) => page.getByLabel("Domain story canvas");

export const diagramElement = (page: Page, id: string) =>
    page.locator(`g.djs-element[data-element-id="${id}"]`);

export const hitTarget = (element: Locator) =>
    element.locator(":scope > .djs-hit").first();

export async function clickDiagramElement(page: Page, elementId: string) {
    const bounds = await hitTarget(
        diagramElement(page, elementId),
    ).boundingBox();
    if (!bounds) {
        throw new Error(`Could not measure diagram element ${elementId}.`);
    }
    await page.mouse.click(
        bounds.x + bounds.width / 2,
        bounds.y + bounds.height / 2,
    );
}

export async function openDemo(page: Page) {
    await page.goto("/");
    await expect(page.getByRole("status")).toHaveText("Editor ready.");
    await expect(canvas(page).locator(".djs-container")).toBeVisible();
    await expect(page.getByTitle("Create Person")).toBeVisible();
    await expect(page.getByTitle("Create Document")).toBeVisible();
}

export async function createShape(
    page: Page,
    title: "Create Person" | "Create Document",
    position: { x: number; y: number },
) {
    const idsBefore = await canvas(page)
        .locator(
            'g.djs-element[data-element-id]:not([data-element-id^="__implicitroot"])',
        )
        .evaluateAll((elements) =>
            elements.map((element) => element.getAttribute("data-element-id")),
        );

    await page.getByTitle(title).click();
    await canvas(page).click({ position });

    const created = canvas(page).locator(
        'g.djs-element[data-element-id]:not([data-element-id^="__implicitroot"])',
    );
    await expect(created).toHaveCount(idsBefore.length + 1);
    await page.keyboard.press("Escape");

    const idsAfter = await created.evaluateAll((elements) =>
        elements.map((element) => element.getAttribute("data-element-id")),
    );
    const id = idsAfter.find((candidate) => !idsBefore.includes(candidate));
    if (!id) {
        throw new Error(`Could not find the shape created through ${title}.`);
    }
    return id;
}

export async function connectThroughContextPad(
    page: Page,
    sourceId: string,
    targetId: string,
) {
    const activitiesBefore = await activityIds(page);
    await clickDiagramElement(page, sourceId);
    await expect(page.getByTitle("Connect with activity")).toBeVisible();
    await page.getByTitle("Connect with activity").click();
    await clickDiagramElement(page, targetId);

    await expect
        .poll(async () => (await activityIds(page)).length)
        .toBe(activitiesBefore.length + 1);
    const activitiesAfter = await activityIds(page);
    const id = activitiesAfter.find(
        (candidate) => !activitiesBefore.includes(candidate),
    );
    if (!id) {
        throw new Error("Could not find the activity created through the pad.");
    }
    return id;
}

export async function editInlineLabel(
    page: Page,
    elementId: string,
    label: string,
) {
    await hitTarget(diagramElement(page, elementId)).dblclick({ force: true });
    const editor = page.locator(".djs-direct-editing-content");
    await expect(editor).toBeVisible();
    await editor.fill(label);
    await page.keyboard.press("Enter");
    await expect(editor).toBeHidden();
}

export async function openActivityPopup(page: Page, activityId: string) {
    await hitTarget(diagramElement(page, activityId)).dblclick({ force: true });
    const popup = page.locator('[data-numbering-popup="true"]');
    await expect(popup).toBeVisible();
    return popup;
}

export async function exportStory(page: Page): Promise<ExportedStory> {
    await page.getByRole("button", { name: "Export JSON" }).click();
    await expect(page.getByRole("status")).toHaveText(
        "Story exported to the JSON panel.",
    );
    return JSON.parse(await page.getByLabel("Story JSON").inputValue());
}

export async function activityIds(page: Page) {
    return canvas(page)
        .locator(".djs-connection[data-element-id]")
        .evaluateAll((elements) =>
            elements.map((element) => element.getAttribute("data-element-id")!),
        );
}

export function activityNumber(page: Page, activityId: string) {
    return diagramElement(page, activityId).locator("text.djs-labelNumber");
}
