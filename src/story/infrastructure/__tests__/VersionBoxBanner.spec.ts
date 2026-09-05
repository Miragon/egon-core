import { afterEach, describe, expect, it, vi } from "vitest";
import type Canvas from "diagram-js/lib/core/Canvas";
import type EventBus from "diagram-js/lib/core/EventBus";

import { VersionBoxBanner } from "../VersionBoxBanner";

describe("VersionBoxBanner", () => {
    const destroyCallbacks: (() => void)[] = [];

    function makeSut(container = document.createElement("div")) {
        if (!container.isConnected) document.body.appendChild(container);

        const canvas = {
            getContainer: () => container,
        } as unknown as Canvas;
        const eventBus = {
            on: vi.fn((event: string, callback: () => void) => {
                if (event === "diagram.destroy")
                    destroyCallbacks.push(callback);
            }),
        } as unknown as EventBus;

        return { banner: new VersionBoxBanner(canvas, eventBus), container };
    }

    function mount(container: HTMLElement): HTMLElement {
        return container.querySelector<HTMLElement>(
            '[data-version-banner-mount="true"]',
        )!;
    }

    afterEach(() => {
        destroyCallbacks.splice(0).forEach((destroy) => destroy());
        document.body.innerHTML = "";
        vi.restoreAllMocks();
    });

    it("mounts in an id-free canvas and preserves its existing children", () => {
        const existingSvg = document.createElementNS(
            "http://www.w3.org/2000/svg",
            "svg",
        );
        const existingUi = document.createElement("button");
        const { banner, container } = makeSut();
        container.append(existingSvg, existingUi);

        banner.show("4.0.0");

        expect(container.id).toBe("");
        expect(container.contains(existingSvg)).toBe(true);
        expect(container.contains(existingUi)).toBe(true);
        expect(mount(container).textContent).toContain("Version 4.0.0");
    });

    it("keeps versions owned by separate instances independent", () => {
        const first = makeSut();
        const second = makeSut();

        first.banner.show("1.0.0");
        second.banner.show("4.0.0");

        expect(mount(first.container).textContent).toContain("Version 1.0.0");
        expect(mount(first.container).textContent).not.toContain(
            "Version 4.0.0",
        );
        expect(mount(second.container).textContent).toContain("Version 4.0.0");
    });

    it("updates the existing mount without creating a duplicate", () => {
        const { banner, container } = makeSut();

        banner.show("1.0.0");
        const firstMount = mount(container);
        banner.show("2.2.0");

        expect(mount(container)).toBe(firstMount);
        expect(
            container.querySelectorAll('[data-version-banner-mount="true"]'),
        ).toHaveLength(1);
        expect(firstMount.textContent).toContain("Version 2.2.0");
        expect(firstMount.textContent).not.toContain("Version 1.0.0");
    });

    it("tears down only the destroyed instance", () => {
        const first = makeSut();
        const second = makeSut();
        first.banner.show("1.0.0");
        second.banner.show("4.0.0");

        destroyCallbacks[0]();

        expect(
            first.container.querySelector('[data-version-banner-mount="true"]'),
        ).toBeNull();
        expect(mount(second.container).textContent).toContain("Version 4.0.0");
    });
});
