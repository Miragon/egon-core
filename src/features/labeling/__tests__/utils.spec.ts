import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Element } from "diagram-js/lib/model/Types";
import EventBus from "diagram-js/lib/core/EventBus";

import {
    approximateArialSize11TextWidthInPixel,
    createAutocompleteForEdit,
} from "../utils";
import { ElementTypes } from "../../../domain/entities/elementTypes";

/**
 * Regression tests for the upstream autocomplete port (issue #5). The port
 * fixes dead keyboard navigation and brings in listener cleanup,
 * click-to-select, no-autocomplete-on-actors, and Shift+Enter linebreaks —
 * behaviours the earlier local TS conversion had silently broken. jsdom (the
 * global test environment) supplies the DOM these handlers manipulate.
 */

/**
 * Fake business element. The autocomplete only reads `type` (to gate on
 * work objects) and writes `businessObject.name` on selection, so a minimal
 * stand-in is enough — cast to diagram-js's `Element` at the call site.
 */
function makeElement(type: string): Element {
    return {
        type,
        businessObject: { name: "" },
    } as unknown as Element;
}

/** A recycled contenteditable box carries a `.value` the handlers read/write. */
type EditingBox = HTMLElement & { value?: string };

interface Harness {
    editingBox: EditingBox;
    element: Element;
    eventBus: EventBus;
    fire: ReturnType<typeof vi.fn>;
}

/**
 * Build the DOM the provider hands to the autocomplete: a container holding a
 * contenteditable-like editing box. The container is attached to document.body
 * so the handlers' `getElementById("autocomplete-list")` lookups resolve.
 */
function setup(type: string): Harness {
    const container = document.createElement("div");
    const editingBox = document.createElement("div") as EditingBox;
    editingBox.className = "djs-direct-editing-content";
    container.appendChild(editingBox);
    document.body.appendChild(container);

    const fire = vi.fn();
    const eventBus = { fire } as unknown as EventBus;

    return { editingBox, element: makeElement(type), eventBus, fire };
}

/** Simulate a keystroke that mutates the box text, then fire its input event. */
function typeInto(editingBox: EditingBox, text: string) {
    editingBox.innerHTML = text;
    editingBox.dispatchEvent(new Event("input"));
}

/** Dispatch a cancelable keydown so preventDefault has an observable effect. */
function pressKey(
    editingBox: EditingBox,
    key: string,
    opts: { shiftKey?: boolean } = {},
): KeyboardEvent {
    const event = new KeyboardEvent("keydown", {
        key,
        shiftKey: opts.shiftKey ?? false,
        cancelable: true,
        bubbles: true,
    });
    editingBox.dispatchEvent(event);
    return event;
}

/** The item <div>s currently rendered in the suggestion list. */
function listItems(): HTMLDivElement[] {
    const list = document.getElementById("autocomplete-list");
    return list ? Array.from(list.getElementsByTagName("div")) : [];
}

/** Index of the highlighted suggestion, or -1 when none is active. */
function activeIndex(): number {
    return listItems().findIndex((item) =>
        item.classList.contains("autocomplete-active"),
    );
}

const WORKOBJECT_TYPE = ElementTypes.WORKOBJECT + "Document";
const ACTOR_TYPE = ElementTypes.ACTOR + "Person";

// Each createAutocompleteForEdit call registers a document-level click listener
// that survives DOM resets. Left in place they leak across tests and interfere
// with one another, so record and detach them per test for isolation.
const originalAddEventListener = document.addEventListener.bind(document);
const registeredClickListeners: EventListener[] = [];

beforeEach(() => {
    document.body.innerHTML = "";
    registeredClickListeners.length = 0;
    vi.spyOn(document, "addEventListener").mockImplementation(
        (type, listener, options) => {
            if (type === "click") {
                registeredClickListeners.push(listener as EventListener);
            }
            originalAddEventListener(type, listener as EventListener, options);
        },
    );
});

afterEach(() => {
    for (const listener of registeredClickListeners) {
        document.removeEventListener("click", listener);
    }
    vi.restoreAllMocks();
});

describe("approximateArialSize11TextWidthInPixel", () => {
    it("returns the character count times the median glyph width", () => {
        expect(approximateArialSize11TextWidthInPixel("abcd")).toBeCloseTo(
            4 * 5.1,
        );
    });

    it("returns 0 for empty text", () => {
        expect(approximateArialSize11TextWidthInPixel("")).toBe(0);
    });

    it("returns 0 for undefined text", () => {
        expect(
            approximateArialSize11TextWidthInPixel(
                undefined as unknown as string,
            ),
        ).toBe(0);
    });

    it("reproduces the old calculateTextWidth via the renderer's /2 + 20 offset", () => {
        // The renderer moved the `/2 + 20` layout offset to its call site; the
        // combined result must still match the pre-refactor calculateTextWidth.
        const name = "Order";
        const rendererOffset =
            approximateArialSize11TextWidthInPixel(name) / 2 + 20;
        expect(rendererOffset).toBeCloseTo((name.length * 5.1) / 2 + 20);
    });
});

describe("createAutocompleteForEdit", () => {
    describe("actors", () => {
        it("creates no list on input and ignores keydown", () => {
            const { editingBox, element, eventBus } = setup(ACTOR_TYPE);
            createAutocompleteForEdit(
                editingBox,
                ["Person", "Team"],
                element,
                eventBus,
            );

            typeInto(editingBox, "Pe");
            expect(document.getElementById("autocomplete-list")).toBeNull();

            const event = pressKey(editingBox, "ArrowDown");
            expect(event.defaultPrevented).toBe(false);
        });
    });

    describe("search filtering", () => {
        it("lists all names for an empty search term", () => {
            const { editingBox, element, eventBus } = setup(WORKOBJECT_TYPE);
            createAutocompleteForEdit(
                editingBox,
                ["Apple", "Banana", "Cherry"],
                element,
                eventBus,
            );

            typeInto(editingBox, "");
            expect(listItems().map((i) => i.textContent)).toEqual([
                "Apple",
                "Banana",
                "Cherry",
            ]);
        });

        it("filters case-insensitively by prefix and de-duplicates", () => {
            const { editingBox, element, eventBus } = setup(WORKOBJECT_TYPE);
            createAutocompleteForEdit(
                editingBox,
                ["Apple", "Apricot", "Apple", "Banana"],
                element,
                eventBus,
            );

            // lowercase input must still match the capitalised names
            typeInto(editingBox, "ap");
            expect(listItems().map((i) => i.textContent)).toEqual([
                "Apple",
                "Apricot",
            ]);
        });
    });

    describe("keyboard navigation", () => {
        it("moves and wraps the active highlight with the arrow keys", () => {
            const { editingBox, element, eventBus } = setup(WORKOBJECT_TYPE);
            createAutocompleteForEdit(
                editingBox,
                ["Alpha", "Beta", "Gamma"],
                element,
                eventBus,
            );
            typeInto(editingBox, "");

            expect(activeIndex()).toBe(-1);

            expect(pressKey(editingBox, "ArrowDown").defaultPrevented).toBe(
                true,
            );
            expect(activeIndex()).toBe(0);

            pressKey(editingBox, "ArrowDown");
            pressKey(editingBox, "ArrowDown");
            expect(activeIndex()).toBe(2);

            // past the end wraps back to the first item
            pressKey(editingBox, "ArrowDown");
            expect(activeIndex()).toBe(0);

            // before the start wraps to the last item
            expect(pressKey(editingBox, "ArrowUp").defaultPrevented).toBe(true);
            expect(activeIndex()).toBe(2);
        });
    });

    describe("selection", () => {
        it("commits a focused suggestion on Enter and fires element.changed", () => {
            const { editingBox, element, eventBus, fire } =
                setup(WORKOBJECT_TYPE);
            createAutocompleteForEdit(
                editingBox,
                ["Apple", "Banana"],
                element,
                eventBus,
            );
            typeInto(editingBox, "");
            pressKey(editingBox, "ArrowDown"); // focus "Apple"

            const event = pressKey(editingBox, "Enter");

            expect(event.defaultPrevented).toBe(true);
            expect(element.businessObject.name).toBe("Apple");
            expect(fire).toHaveBeenCalledWith("element.changed", { element });
        });

        it("inserts a linebreak on Shift+Enter instead of selecting", () => {
            const { editingBox, element, eventBus, fire } =
                setup(WORKOBJECT_TYPE);
            createAutocompleteForEdit(
                editingBox,
                ["Apple", "Banana"],
                element,
                eventBus,
            );
            typeInto(editingBox, "");
            pressKey(editingBox, "ArrowDown");

            const event = pressKey(editingBox, "Enter", { shiftKey: true });

            expect(event.defaultPrevented).toBe(false);
            expect(element.businessObject.name).toBe("");
            expect(fire).not.toHaveBeenCalled();
        });

        it("selects nothing on Enter without a focused suggestion", () => {
            const { editingBox, element, eventBus, fire } =
                setup(WORKOBJECT_TYPE);
            createAutocompleteForEdit(
                editingBox,
                ["Apple", "Banana"],
                element,
                eventBus,
            );
            typeInto(editingBox, ""); // currentFocus resets to -1

            pressKey(editingBox, "Enter");

            expect(element.businessObject.name).toBe("");
            expect(fire).not.toHaveBeenCalled();
        });

        it("activates and refocuses the box when a suggestion is clicked", () => {
            const { editingBox, element, eventBus } = setup(WORKOBJECT_TYPE);
            const focusSpy = vi.spyOn(editingBox, "focus");
            createAutocompleteForEdit(
                editingBox,
                ["Apple", "Banana"],
                element,
                eventBus,
            );
            typeInto(editingBox, "");

            listItems()[1].dispatchEvent(
                new MouseEvent("click", { bubbles: true, cancelable: true }),
            );

            expect(activeIndex()).toBe(1);
            expect(focusSpy).toHaveBeenCalled();
        });
    });

    describe("listener cleanup", () => {
        it("stops rebuilding the list after Enter-selection", () => {
            const { editingBox, element, eventBus } = setup(WORKOBJECT_TYPE);
            createAutocompleteForEdit(
                editingBox,
                ["Apple", "Banana"],
                element,
                eventBus,
            );
            typeInto(editingBox, "");
            pressKey(editingBox, "ArrowDown");
            pressKey(editingBox, "Enter");

            // the input listener is gone: clearing the list and typing again
            // must not resurrect it
            document.getElementById("autocomplete-list")?.remove();
            typeInto(editingBox, "Banana");

            expect(document.getElementById("autocomplete-list")).toBeNull();
        });

        it("removes the list and its listener on an outside click", () => {
            const { editingBox, element, eventBus } = setup(WORKOBJECT_TYPE);
            createAutocompleteForEdit(
                editingBox,
                ["Apple", "Banana"],
                element,
                eventBus,
            );
            typeInto(editingBox, "");
            expect(document.getElementById("autocomplete-list")).not.toBeNull();

            document.body.dispatchEvent(
                new MouseEvent("click", { bubbles: true }),
            );
            expect(document.getElementById("autocomplete-list")).toBeNull();

            // the input listener was torn down alongside the list
            typeInto(editingBox, "Apple");
            expect(document.getElementById("autocomplete-list")).toBeNull();
        });

        it("keeps the list open when clicking the editing box or a suggestion", () => {
            const { editingBox, element, eventBus } = setup(WORKOBJECT_TYPE);
            createAutocompleteForEdit(
                editingBox,
                ["Apple", "Banana"],
                element,
                eventBus,
            );
            typeInto(editingBox, "");

            editingBox.dispatchEvent(
                new MouseEvent("click", { bubbles: true }),
            );
            expect(document.getElementById("autocomplete-list")).not.toBeNull();

            listItems()[0].dispatchEvent(
                new MouseEvent("click", { bubbles: true }),
            );
            expect(document.getElementById("autocomplete-list")).not.toBeNull();
        });
    });
});
