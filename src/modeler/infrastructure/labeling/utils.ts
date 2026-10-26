import { Element } from "diagram-js/lib/model/Types";

import EventBus from "diagram-js/lib/core/EventBus";
import {
    canAutocompleteLabel,
    semanticLabelField,
} from "../../../story/domain/labelPolicy";

export function getLabel(element: Element) {
    let semantic;
    if (element.businessObject) {
        semantic = element.businessObject;
    } else {
        semantic = element;
    }
    const attr = semanticLabelField(semantic);
    if (attr && semantic) {
        return semantic[attr] || "";
    }
}

export function setLabel(element: Element, text: string) {
    let semantic;
    if (element.businessObject) {
        semantic = element.businessObject;
    } else {
        semantic = element;
    }
    const attr = semanticLabelField(semantic);

    if (attr) {
        semantic[attr] = text;
    }
    return element;
}

type EditingBoxElement = HTMLElement & {
    __egonAutocompleteTeardown?: () => void;
};

/** 5.1px is the median Arial glyph width at font-size 11. */
export function approximateArialSize11TextWidthInPixel(text: string) {
    if (!text) {
        return 0;
    }
    return text.length * 5.1;
}

/**
 * Port of upstream `dsLabelUtil.js`. Only work objects get suggestions, since
 * actors are meant to be unique. The check repeats inside the handlers because
 * the editing box is recycled and can fire with a stale businessElement.
 */
export function createAutocompleteForEdit(
    editingBox: HTMLElement,
    workObjectNames: string[],
    businessElement: Element,
    eventBus: EventBus,
) {
    clearOldAutocompleteList();

    // A leftover keydown handler on the recycled box tests the element it
    // captured, so Enter on an actor would rename the previous work object.
    // Must run before the early return below.
    const recycledEditingBox = editingBox as EditingBoxElement;
    recycledEditingBox.__egonAutocompleteTeardown?.();
    delete recycledEditingBox.__egonAutocompleteTeardown;

    if (!canAutocompleteLabel(businessElement)) {
        return;
    }

    let currentFocus: number;
    let workObjectNamesFilteredBySearchterm: string[];

    editingBox.addEventListener("input", inputFunction);

    /** Named so it can be removed again; the box is reused for the next element. */
    function inputFunction(this: EditingBoxElement) {
        if (
            !workObjectNames ||
            workObjectNames.length === 0 ||
            !canAutocompleteLabel(businessElement)
        ) {
            return;
        }

        // `innerText` keeps markup literal and line breaks as rendered; jsdom
        // lacks it, hence the `textContent` fallback.
        const searchterm = (
            this.innerText ??
            this.textContent ??
            ""
        ).toUpperCase();
        currentFocus = -1;

        clearOldAutocompleteList();

        const autocompleteList = document.createElement("DIV");
        autocompleteList.setAttribute("id", "autocomplete-list");
        autocompleteList.setAttribute("class", "autocomplete-items");
        this.parentNode?.appendChild(autocompleteList);

        workObjectNamesFilteredBySearchterm = [];
        for (const name of workObjectNames) {
            if (
                searchterm.length === 0 ||
                (name.toUpperCase().startsWith(searchterm) &&
                    !workObjectNamesFilteredBySearchterm.includes(name))
            ) {
                const autocompleteItem = document.createElement("div");

                autocompleteItem.textContent = name;

                autocompleteItem.addEventListener("click", function (e) {
                    e.preventDefault();
                    currentFocus =
                        workObjectNamesFilteredBySearchterm.indexOf(name);
                    updateFocusOnAutocompleteList();
                    // keydown events don't reach the item itself, so hand focus
                    // back to the editing box to keep keyboard control working
                    editingBox.focus();
                });

                autocompleteList.appendChild(autocompleteItem);
                workObjectNamesFilteredBySearchterm.push(name);
            }
        }
    }

    const keydownFunction = function (e: KeyboardEvent) {
        if (!canAutocompleteLabel(businessElement)) {
            return;
        }

        // Upstream branches on the deprecated keyCode 40/38.
        if (e.key === "ArrowDown") {
            e.preventDefault();
            currentFocus++;
            updateFocusOnAutocompleteList();
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            currentFocus--;
            updateFocusOnAutocompleteList();
        } else if (e.key === "Enter" && !e.shiftKey) {
            // Shift+Enter is excluded so it still inserts a linebreak.
            e.preventDefault();
            if (currentFocus > -1) {
                // Capture phase: fill the editor before DirectEditing's own
                // keydown listener commits it through `element.updateLabel`, so
                // the change stays on the command stack.
                editingBox.innerText =
                    workObjectNamesFilteredBySearchterm[currentFocus];

                // Re-added whenever the box reopens; drop it to avoid stacking.
                editingBox.removeEventListener("input", inputFunction);
            }
        }
    };

    editingBox.addEventListener("keydown", keydownFunction, true);

    /** Keeps the list open for clicks on the editing box or the list itself. */
    function clearOldAutocompleteList(target?: HTMLElement | null) {
        const oldAutocompleteList =
            document.getElementById("autocomplete-list");
        if (
            oldAutocompleteList &&
            !(
                target?.classList.contains("djs-direct-editing-content") ||
                target?.parentElement?.id === "autocomplete-list"
            )
        ) {
            oldAutocompleteList.remove();
            return true;
        }
        return false;
    }

    function updateFocusOnAutocompleteList() {
        const autocompleteList = document.getElementById("autocomplete-list");
        const autocompleteListItems =
            autocompleteList?.getElementsByTagName("div");
        if (!autocompleteListItems || autocompleteListItems.length < 1) {
            return;
        }

        Array.from(autocompleteListItems).forEach((item) => {
            item.classList.remove("autocomplete-active");
        });

        if (currentFocus >= autocompleteListItems.length) {
            currentFocus = 0;
        } else if (currentFocus < 0) {
            currentFocus = autocompleteListItems.length - 1;
        }

        autocompleteListItems[currentFocus].classList.add(
            "autocomplete-active",
        );
    }

    // Closing the list leaves the input listener stale, so remove it too.
    function documentClickListener(e: MouseEvent) {
        if (clearOldAutocompleteList(e.target as HTMLElement | null)) {
            editingBox.removeEventListener("input", inputFunction);
        }
    }

    document.addEventListener("click", documentClickListener);

    /**
     * Escape-cancelling runs `TextBox.destroy()`, which only unbinds diagram-js's
     * own listeners; without this, ours pile up on the recycled node.
     */
    function teardown() {
        editingBox.removeEventListener("input", inputFunction);
        editingBox.removeEventListener("keydown", keydownFunction, true);
        document.removeEventListener("click", documentClickListener);
        if (recycledEditingBox.__egonAutocompleteTeardown === teardown) {
            delete recycledEditingBox.__egonAutocompleteTeardown;
        }
    }

    recycledEditingBox.__egonAutocompleteTeardown = teardown;
    eventBus.once(["directEditing.complete", "directEditing.cancel"], teardown);
}
