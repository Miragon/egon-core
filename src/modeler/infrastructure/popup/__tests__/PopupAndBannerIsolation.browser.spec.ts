import { afterEach, describe, expect, it } from "vitest";
import type { Connection } from "diagram-js/lib/model/Types";

import {
    createTestModeler,
    type TestModeler,
} from "../../../../__tests__/helpers/createTestModeler";
import { importFixture } from "../../../../__tests__/helpers/importFixture";
import {
    addActor,
    addWorkObject,
    connect,
} from "../../../../__tests__/helpers/storyBuilder";
import type { DomainStoryDocument } from "../../../../story/domain/DomainStoryDocument";
import { isActivity } from "../../../../story/domain/elementPredicates";
import type { DomainStoryImportService } from "../../../../story/service/DomainStoryImportService";

describe("popup and version banner canvas ownership (browser)", () => {
    let modelers: TestModeler[] = [];
    const sharedHosts: HTMLElement[] = [];

    afterEach(() => {
        modelers.splice(0).forEach((modeler) => modeler.cleanup());
        sharedHosts.splice(0).forEach((host) => host.remove());
    });

    function boot(options: { container?: HTMLElement } = {}): TestModeler {
        const modeler = createTestModeler(options);
        modelers.push(modeler);
        return modeler;
    }

    function popupOf(modeler: TestModeler): HTMLElement {
        return modeler.canvas
            .getContainer()
            .querySelector<HTMLElement>('[data-numbering-popup="true"]')!;
    }

    function bannerMountOf(modeler: TestModeler): HTMLElement {
        return modeler.canvas
            .getContainer()
            .querySelector<HTMLElement>('[data-version-banner-mount="true"]')!;
    }

    function openPopup(
        modeler: TestModeler,
        activity: Connection,
    ): HTMLElement {
        modeler.eventBus.fire("element.dblclick", { element: activity });
        return popupOf(modeler);
    }

    function importCinema(modeler: TestModeler): void {
        const cinema = importFixture<DomainStoryDocument>(
            "egn_cinema_story.egn.json",
        );
        modeler
            .get<DomainStoryImportService>("domainStoryImportService")
            .import(JSON.stringify(cinema));
    }

    it("positions a real popup from the canvas origin under pan and zoom", () => {
        const modeler = boot();
        const canvasContainer = modeler.canvas.getContainer();
        const toolbar = document.createElement("div");
        toolbar.textContent = "Host toolbar";
        toolbar.style.height = "37px";

        // Put several distinct offsets between the page and diagram canvas.
        // A popup positioned against the outer host will be wrong by their sum.
        modeler.container.style.margin = "41px 0 0 53px";
        modeler.container.style.padding = "19px";
        modeler.container.insertBefore(toolbar, canvasContainer);

        const actor = addActor(modeler, { point: { x: 160, y: 150 } });
        const workObject = addWorkObject(modeler, {
            point: { x: 520, y: 390 },
        });
        const activity = connect(modeler, actor, workObject)!;

        const initialViewbox = modeler.canvas.viewbox();
        modeler.canvas.viewbox({
            x: 45,
            y: 30,
            width: initialViewbox.outer.width / 1.6,
            height: initialViewbox.outer.height / 1.6,
        });

        const popup = openPopup(modeler, activity);
        const viewbox = modeler.canvas.viewbox();
        const first = activity.waypoints[0];
        const last = activity.waypoints[activity.waypoints.length - 1];
        const expectedX = ((first.x + last.x) / 2 - viewbox.x) * viewbox.scale;
        const expectedY = ((first.y + last.y) / 2 - viewbox.y) * viewbox.scale;
        const popupRect = popup.getBoundingClientRect();
        const canvasRect = canvasContainer.getBoundingClientRect();

        expect(viewbox.scale).not.toBe(1);
        expect(canvasRect.left).toBeGreaterThan(0);
        expect(canvasRect.top).toBeGreaterThan(toolbar.offsetHeight);
        expect(popupRect.left - canvasRect.left).toBeCloseTo(expectedX, 1);
        expect(popupRect.top - canvasRect.top).toBeCloseTo(expectedY, 1);
    });

    it("isolates popup and banner lifecycles for two modelers in one host", async () => {
        const sharedHost = document.createElement("div");
        sharedHost.style.width = "800px";
        sharedHost.style.height = "600px";
        document.body.appendChild(sharedHost);
        sharedHosts.push(sharedHost);

        const first = boot({ container: sharedHost });
        const second = boot({ container: sharedHost });
        const firstCanvas = first.canvas.getContainer();
        const secondCanvas = second.canvas.getContainer();

        importCinema(first);
        importCinema(second);

        const firstActivity = first.elementRegistry
            .getAll()
            .find(isActivity) as Connection;
        const secondActivity = second.elementRegistry
            .getAll()
            .find(isActivity) as Connection;
        const firstPopup = openPopup(first, firstActivity);
        const secondPopup = openPopup(second, secondActivity);
        const firstBanner = bannerMountOf(first);
        const secondBanner = bannerMountOf(second);

        expect(firstCanvas).not.toBe(secondCanvas);
        expect(sharedHost.contains(firstCanvas)).toBe(true);
        expect(sharedHost.contains(secondCanvas)).toBe(true);
        expect(firstCanvas.contains(firstPopup)).toBe(true);
        expect(firstCanvas.contains(firstBanner)).toBe(true);
        expect(secondCanvas.contains(secondPopup)).toBe(true);
        expect(secondCanvas.contains(secondBanner)).toBe(true);
        expect(firstCanvas.contains(secondPopup)).toBe(false);
        expect(firstCanvas.contains(secondBanner)).toBe(false);

        first.cleanup();
        modelers = modelers.filter((modeler) => modeler !== first);

        expect(firstCanvas.isConnected).toBe(false);
        expect(firstPopup.isConnected).toBe(false);
        expect(firstBanner.isConnected).toBe(false);
        expect(secondCanvas.isConnected).toBe(true);
        expect(secondPopup.isConnected).toBe(true);
        expect(secondBanner.isConnected).toBe(true);

        // The surviving instance is still command-capable after its neighbor's
        // entire diagram lifecycle has ended.
        const label = secondPopup.querySelector<HTMLInputElement>(
            'input[name="label"]',
        )!;
        label.value = "still usable";
        label.dispatchEvent(new Event("input", { bubbles: true }));
        await new Promise((resolve) => setTimeout(resolve, 0));
        Array.from(secondPopup.querySelectorAll("button"))
            .find((button) => button.textContent?.trim() === "Update")!
            .dispatchEvent(new MouseEvent("click", { bubbles: true }));

        expect(secondActivity.businessObject.name).toBe("still usable");
        expect(secondPopup.isConnected).toBe(false);
        expect(secondBanner.isConnected).toBe(true);
    });
});
