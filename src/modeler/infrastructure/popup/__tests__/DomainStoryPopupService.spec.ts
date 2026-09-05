import { afterEach, describe, expect, it, vi } from "vitest";
import type Canvas from "diagram-js/lib/core/Canvas";
import type CommandStack from "diagram-js/lib/command/CommandStack";
import type EventBus from "diagram-js/lib/core/EventBus";

import { DomainStoryPopupService } from "../DomainStoryPopupService";
import type { ElementRegistryService } from "../../../service/ElementRegistryService";
import type { ActivityCanvasObject } from "../../../../story/domain/canvasObject";
import { ElementTypes } from "../../../../story/domain/elementTypes";

/**
 * The popup's whole contract (issue #68): translate the form into exactly one
 * `activity.changed` action and touch nothing else. It used to mutate the
 * business object before executing and run the renumbering cascade after it,
 * which put three quarters of the edit outside the undo stack.
 *
 * WHY it is driven through the real preact render rather than by calling
 * `handleUpdate`: the mapping under test spans `PopupMenu`'s state (an empty
 * number field becomes `0`, the checkbox has to open pre-ticked) and the
 * service's translation of it. Calling the private method would skip exactly
 * the half that was wrong. Unit tier — no canvas, no SVG (ADR 0014).
 */
describe("DomainStoryPopupService", () => {
    const liveListeners: Map<string, (event: unknown) => void>[] = [];

    /** An activity as the popup reads it: a type, waypoints, a business object. */
    function makeActivity(
        businessObject: Record<string, unknown>,
    ): ActivityCanvasObject {
        return {
            id: businessObject["id"],
            type: ElementTypes.ACTIVITY,
            waypoints: [
                { x: 0, y: 0 },
                { x: 100, y: 100 },
            ],
            businessObject,
        } as unknown as ActivityCanvasObject;
    }

    function makeSut(
        options: {
            isActivityFromActor?: boolean;
            container?: HTMLElement;
        } = {},
    ) {
        const listeners = new Map<string, (event: unknown) => void>();
        const eventBus = {
            on: vi.fn((event: string, callback: (event: unknown) => void) =>
                listeners.set(event, callback),
            ),
        } as unknown as EventBus;
        const commandStack = { execute: vi.fn() } as unknown as CommandStack;
        const container = options.container ?? document.createElement("div");
        if (!container.isConnected) document.body.appendChild(container);
        const canvas = {
            viewbox: () => ({ x: 0, y: 0, scale: 1 }),
            getContainer: () => container,
        } as unknown as Canvas;
        const elementRegistryService = {
            getActivityFromActorById: () =>
                options.isActivityFromActor === false ? undefined : {},
        } as unknown as ElementRegistryService;

        new DomainStoryPopupService(
            canvas,
            eventBus,
            commandStack,
            elementRegistryService,
        );
        liveListeners.push(listeners);

        return { commandStack, container, listeners };
    }

    /**
     * Opens the popup the way a user does — the service only ever opens from its
     * own `element.dblclick` listener — and waits for the timer that installs the
     * outside-click handler, so the rendered DOM is in its steady state.
     */
    async function openPopup(
        listeners: Map<string, (event: unknown) => void>,
        container: HTMLElement,
        element: ActivityCanvasObject,
    ): Promise<HTMLElement> {
        listeners.get("element.dblclick")!({ element });
        await new Promise((resolve) => setTimeout(resolve, 0));
        return container.querySelector<HTMLElement>(
            '[data-numbering-popup="true"]',
        )!;
    }

    const inputNamed = (popup: HTMLElement, name: string) =>
        popup.querySelector<HTMLInputElement>(`input[name="${name}"]`)!;

    /** Types into an input and lets preact flush the resulting state update. */
    async function setInputValue(input: HTMLInputElement, value: string) {
        input.value = value;
        input.dispatchEvent(new Event("input", { bubbles: true }));
        await new Promise((resolve) => setTimeout(resolve, 0));
    }

    function clickUpdate(popup: HTMLElement) {
        Array.from(popup.querySelectorAll("button"))
            .find((button) => button.textContent?.trim() === "Update")!
            .dispatchEvent(new MouseEvent("click", { bubbles: true }));
    }

    afterEach(() => {
        liveListeners.splice(0).forEach((listeners) => {
            listeners.get("diagram.destroy")?.({});
        });
        document.body.innerHTML = "";
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    describe("instance ownership and lifecycle", () => {
        it("mounts in its id-free canvas container", async () => {
            const { container, listeners } = makeSut();
            const element = makeActivity({
                id: "activity_1",
                name: "old",
                number: 1,
                multipleNumberAllowed: false,
            });

            const popup = await openPopup(listeners, container, element);

            expect(container.id).toBe("");
            expect(popup.parentElement?.parentElement).toBe(container);
            expect(
                container.querySelectorAll(
                    '[data-numbering-popup-mount="true"]',
                ),
            ).toHaveLength(1);
        });

        it("keeps two instances independent and treats the other popup as outside", async () => {
            const first = makeSut();
            const second = makeSut();
            const firstElement = makeActivity({
                id: "activity_1",
                name: "first",
                number: 1,
                multipleNumberAllowed: false,
            });
            const secondElement = makeActivity({
                id: "activity_2",
                name: "second",
                number: 2,
                multipleNumberAllowed: false,
            });

            const firstPopup = await openPopup(
                first.listeners,
                first.container,
                firstElement,
            );
            const secondPopup = await openPopup(
                second.listeners,
                second.container,
                secondElement,
            );

            inputNamed(secondPopup, "label").dispatchEvent(
                new MouseEvent("click", { bubbles: true }),
            );

            expect(first.commandStack.execute).toHaveBeenCalledTimes(1);
            expect(second.commandStack.execute).not.toHaveBeenCalled();
            expect(firstPopup.isConnected).toBe(false);
            expect(secondPopup.isConnected).toBe(true);
        });

        it("replaces a popup and submits the replacement on outside click", async () => {
            const { commandStack, container, listeners } = makeSut();
            const firstElement = makeActivity({
                id: "activity_1",
                name: "first",
                number: 1,
                multipleNumberAllowed: false,
            });
            const secondElement = makeActivity({
                id: "activity_2",
                name: "second",
                number: 2,
                multipleNumberAllowed: false,
            });

            const firstPopup = await openPopup(
                listeners,
                container,
                firstElement,
            );
            const secondPopup = await openPopup(
                listeners,
                container,
                secondElement,
            );
            document.body.dispatchEvent(
                new MouseEvent("click", { bubbles: true }),
            );

            expect(firstPopup.isConnected).toBe(false);
            expect(secondPopup.isConnected).toBe(false);
            expect(
                container.querySelectorAll(
                    '[data-numbering-popup-mount="true"]',
                ),
            ).toHaveLength(0);
            expect(commandStack.execute).toHaveBeenCalledTimes(1);
            expect(commandStack.execute).toHaveBeenCalledWith(
                "activity.changed",
                expect.objectContaining({
                    businessObject: secondElement.businessObject,
                    element: secondElement,
                }),
            );
        });

        it("submits current form values on an outside click", async () => {
            const { commandStack, container, listeners } = makeSut();
            const element = makeActivity({
                id: "activity_1",
                name: "old",
                number: 3,
                multipleNumberAllowed: false,
            });
            const popup = await openPopup(listeners, container, element);
            await setInputValue(inputNamed(popup, "label"), "outside update");

            document.body.dispatchEvent(
                new MouseEvent("click", { bubbles: true }),
            );

            expect(commandStack.execute).toHaveBeenCalledWith(
                "activity.changed",
                expect.objectContaining({ newLabel: "outside update" }),
            );
            expect(popup.isConnected).toBe(false);
        });

        it("cancels without submitting", async () => {
            const { commandStack, container, listeners } = makeSut();
            const element = makeActivity({
                id: "activity_1",
                name: "old",
                number: 3,
                multipleNumberAllowed: false,
            });
            const popup = await openPopup(listeners, container, element);

            Array.from(popup.querySelectorAll("button"))
                .find((button) => button.textContent?.trim() === "Cancel")!
                .dispatchEvent(new MouseEvent("click", { bubbles: true }));

            expect(commandStack.execute).not.toHaveBeenCalled();
            expect(popup.isConnected).toBe(false);
        });

        it("destroys cleanly before outside-click registration", () => {
            vi.useFakeTimers();
            const { commandStack, container, listeners } = makeSut();
            const element = makeActivity({
                id: "activity_1",
                name: "old",
                number: 3,
                multipleNumberAllowed: false,
            });

            listeners.get("element.dblclick")!({ element });
            listeners.get("diagram.destroy")!({});
            vi.runAllTimers();
            document.body.dispatchEvent(
                new MouseEvent("click", { bubbles: true }),
            );

            expect(commandStack.execute).not.toHaveBeenCalled();
            expect(
                container.querySelector('[data-numbering-popup-mount="true"]'),
            ).toBeNull();
        });

        it("destroys cleanly after outside-click registration", async () => {
            const { commandStack, container, listeners } = makeSut();
            const element = makeActivity({
                id: "activity_1",
                name: "old",
                number: 3,
                multipleNumberAllowed: false,
            });

            await openPopup(listeners, container, element);
            listeners.get("diagram.destroy")!({});
            document.body.dispatchEvent(
                new MouseEvent("click", { bubbles: true }),
            );

            expect(commandStack.execute).not.toHaveBeenCalled();
            expect(
                container.querySelector('[data-numbering-popup-mount="true"]'),
            ).toBeNull();
        });
    });

    describe("handleUpdate", () => {
        // T4.1
        it("executes exactly one activity.changed carrying the form values", async () => {
            const { commandStack, container, listeners } = makeSut();
            const element = makeActivity({
                id: "activity_1",
                name: "old",
                number: 3,
                multipleNumberAllowed: false,
            });
            const popup = await openPopup(listeners, container, element);

            await setInputValue(inputNamed(popup, "label"), "new label");
            await setInputValue(inputNamed(popup, "index"), "1");
            clickUpdate(popup);

            expect(commandStack.execute).toHaveBeenCalledTimes(1);
            expect(commandStack.execute).toHaveBeenCalledWith(
                "activity.changed",
                {
                    businessObject: element.businessObject,
                    element,
                    newLabel: "new label",
                    newNumber: 1,
                    newMultipleNumberAllowed: false,
                },
            );
        });

        // T4.2 — the "popup must not touch the model" lock. Module code is strict
        // mode, so a write to a frozen object throws rather than failing silently.
        it("does not write to the model", async () => {
            const { container, listeners } = makeSut();
            const element = makeActivity({
                id: "activity_1",
                name: "old",
                number: 3,
                multipleNumberAllowed: false,
            });
            const popup = await openPopup(listeners, container, element);
            await setInputValue(inputNamed(popup, "index"), "1");

            Object.freeze(element.businessObject);

            expect(() => clickUpdate(popup)).not.toThrow();
            expect(element.businessObject.number).toBe(3);
        });

        // T4.3 — `PopupMenu` maps an empty number field to 0; the handler must
        // see "no number", not a number to cascade from.
        it("submits undefined for an empty number field", async () => {
            const { commandStack, container, listeners } = makeSut();
            const element = makeActivity({
                id: "activity_1",
                name: "old",
                number: 3,
                multipleNumberAllowed: false,
            });
            const popup = await openPopup(listeners, container, element);

            await setInputValue(inputNamed(popup, "index"), "");
            clickUpdate(popup);

            expect(commandStack.execute).toHaveBeenCalledWith(
                "activity.changed",
                expect.objectContaining({ newNumber: undefined }),
            );
        });

        // T4.4 — the checkbox used to open unchecked regardless, so re-saving an
        // already-multiple activity silently cleared its allowance.
        it("opens an already-multiple activity checked and submits true", async () => {
            const { commandStack, container, listeners } = makeSut();
            const element = makeActivity({
                id: "activity_1",
                name: "old",
                number: 1,
                multipleNumberAllowed: true,
            });
            const popup = await openPopup(listeners, container, element);

            expect(inputNamed(popup, "multiple").checked).toBe(true);

            clickUpdate(popup);

            expect(commandStack.execute).toHaveBeenCalledWith(
                "activity.changed",
                expect.objectContaining({ newMultipleNumberAllowed: true }),
            );
        });

        it("submits no number for an activity that is not sourced from an actor", async () => {
            const { commandStack, container, listeners } = makeSut({
                isActivityFromActor: false,
            });
            const element = makeActivity({
                id: "activity_1",
                name: "response",
                number: null,
                multipleNumberAllowed: false,
            });
            const popup = await openPopup(listeners, container, element);

            // No number input is rendered at all for a response arrow.
            expect(popup.querySelector('input[name="index"]')).toBeNull();

            clickUpdate(popup);

            expect(commandStack.execute).toHaveBeenCalledWith(
                "activity.changed",
                expect.objectContaining({ newNumber: undefined }),
            );
        });
    });
});
