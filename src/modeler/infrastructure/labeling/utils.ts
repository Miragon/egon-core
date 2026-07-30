import { Element } from "diagram-js/lib/model/Types";

import {
    isActivity,
    isActor,
    isAnnotation,
    isGroup,
    isWorkObject,
} from "../../../story/domain/elementPredicates";
import EventBus from "diagram-js/lib/core/EventBus";

function getLabelAttr(semantic: any) {
    if (
        isActor(semantic) ||
        isWorkObject(semantic) ||
        isActivity(semantic) ||
        isGroup(semantic)
    ) {
        return "name";
    }
    if (isAnnotation(semantic)) {
        return "text";
    } else {
        return "";
    }
}

export function getLabel(element: Element) {
    let semantic;
    if (element.businessObject) {
        semantic = element.businessObject;
    } else {
        semantic = element;
    }
    const attr = getLabelAttr(semantic);
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
    const attr = getLabelAttr(semantic);

    if (attr) {
        semantic[attr] = text;
    }
    return element;
}

// select at which part of the activity the label should be attached to
export function selectPartOfActivity(waypoints: any, angleActivity: any) {
    const lineLength = 49;
    let selectedActivity = 0;

    for (let i = 0; i < waypoints.length; i++) {
        if (angleActivity[i] === 0 || angleActivity[i] === 180) {
            const length = Math.abs(waypoints[i].x - waypoints[i + 1].x);
            if (length > lineLength) {
                selectedActivity = i;
            }
        }
    }
    return selectedActivity;
}

/**
 * The direct-editing box is a recycled contenteditable <div>, not an <input>,
 * yet upstream reads and writes a `.value` on it to normalise the stale
 * recycled text before filtering. Model that access narrowly so the port keeps
 * the behaviour without pretending the element is a real form control.
 */
type EditingBoxElement = HTMLElement & { value?: string };

/**
 * Approximate the rendered width (in px) of a label at font-size 11 in Arial.
 * 5.1 is the median glyph width at that size; the renderer adds its own layout
 * offset at the call site. Returns 0 for empty/undefined so blank labels
 * contribute no width.
 */
export function approximateArialSize11TextWidthInPixel(text: string) {
    if (!text) {
        return 0;
    }
    return text.length * 5.1;
}

/**
 * Wire the work-object autocomplete onto a direct-editing box. Ported from
 * upstream egon.io (dsLabelUtil.js @ e7ce503d), whose rewrite of the original
 * w3schools snippet fixed six bugs — no autocomplete on actors, input-listener
 * cleanup, click-to-select, null-safe DOM access, correct search-term handling,
 * and Shift+Enter linebreaks. This TS port additionally revives keyboard
 * navigation, which the earlier local conversion silently killed by turning
 * `keyCode === 40/38/13` checks into `e.key` cases comparing against the
 * numeric strings "40"/"38"/"13" (e.key is "ArrowDown"/"ArrowUp"/"Enter").
 *
 * Suggestions only make sense for work objects — actors are meant to be unique
 * — so the function early-returns for non-work-objects. The check is repeated
 * inside the input and keydown handlers because the editing box is recycled
 * across elements and can otherwise fire with a stale businessElement.
 */
export function createAutocompleteForEdit(
    editingBox: HTMLElement,
    workObjectNames: string[],
    businessElement: Element,
    eventBus: EventBus,
) {
    clearOldAutocompleteList();

    // The editing box is a single recycled node, so a keydown handler left over
    // from the previous session outlives it — and its work-object guard tests
    // the element *it* captured, so it always passes. Editing an actor right
    // after a work object would then let Enter rename that work object outside
    // the command stack. Reset before the early return below, which is exactly
    // the path that used to skip it.
    editingBox.onkeydown = null;

    if (!businessElement || !isWorkObject(businessElement)) {
        return;
    }

    let currentFocus: number;
    let workObjectNamesFilteredBySearchterm: string[];

    editingBox.addEventListener("input", inputFunction);

    /**
     * Rebuild the suggestion list on every keystroke. Registered by name so it
     * can be removed again once a suggestion is committed or the list closes —
     * the stale-listener fix, since the box is reused for the next element.
     */
    function inputFunction(this: EditingBoxElement) {
        if (
            !workObjectNames ||
            workObjectNames.length === 0 ||
            !businessElement ||
            !isWorkObject(businessElement)
        ) {
            return;
        }

        // the recycled direct-editing element carries an old value that must be
        // overridden with its current text before we filter against it
        if (isWorkObject(businessElement)) {
            this.value = this.innerHTML;
        }

        const searchterm = this.value?.toUpperCase() ?? "";
        currentFocus = -1;

        clearOldAutocompleteList();

        const autocompleteList = document.createElement("DIV");
        autocompleteList.setAttribute("id", "autocomplete-list");
        autocompleteList.setAttribute("class", "autocomplete-items");
        this.parentNode?.appendChild(autocompleteList);

        workObjectNamesFilteredBySearchterm = [];
        for (const name of workObjectNames) {
            // an empty term lists everything; otherwise prefix-match
            // case-insensitively and drop duplicates
            if (
                searchterm.length === 0 ||
                (name.toUpperCase().startsWith(searchterm) &&
                    !workObjectNamesFilteredBySearchterm.includes(name))
            ) {
                const autocompleteItem = document.createElement("div");

                autocompleteItem.innerHTML = name;
                autocompleteItem.innerHTML +=
                    "<input type='hidden' value='" + name + "'>";

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

    editingBox.onkeydown = function (e: KeyboardEvent) {
        if (!businessElement || !isWorkObject(businessElement)) {
            return;
        }

        // upstream still branches on the deprecated keyCode 40/38; e.key is the
        // idiomatic, behaviourally identical replacement and is what fixes the
        // dead-navigation regression this port targets
        if (e.key === "ArrowDown") {
            e.preventDefault();
            currentFocus++;
            updateFocusOnAutocompleteList();
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            currentFocus--;
            updateFocusOnAutocompleteList();
        } else if (e.key === "Enter" && !e.shiftKey) {
            // Shift+Enter is intentionally excluded so it still inserts a
            // linebreak instead of committing a suggestion
            e.preventDefault();
            if (currentFocus > -1) {
                businessElement.businessObject.name =
                    workObjectNamesFilteredBySearchterm[currentFocus];
                eventBus.fire("element.changed", { element: businessElement });

                // the input listener is re-added whenever the box reopens, so
                // drop this one to avoid stacking stale handlers
                editingBox.removeEventListener("input", inputFunction);
            }
        }
    };

    /**
     * Remove a stale suggestion list, unless the click that triggered the check
     * landed on the editing box or inside the list itself — those interactions
     * should keep it open. Returns whether a list was actually removed.
     */
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

    /**
     * Move the "active" highlight to the item at currentFocus, wrapping around
     * at both ends. Null-safe: does nothing when the list has already gone.
     */
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

    // an outside click closes the list; when it does, the input listener is now
    // stale, so remove it too
    function documentClickListener(e: MouseEvent) {
        if (clearOldAutocompleteList(e.target as HTMLElement | null)) {
            editingBox.removeEventListener("input", inputFunction);
        }
    }

    document.addEventListener("click", documentClickListener);

    /**
     * Drop everything this session attached. Escape-cancelling goes through
     * `TextBox.destroy()`, which only unbinds diagram-js's own listeners, so
     * without this the input handlers and one document click listener per
     * session pile up on the recycled node — unbounded, and shared across
     * modeler instances.
     */
    function teardown() {
        editingBox.removeEventListener("input", inputFunction);
        document.removeEventListener("click", documentClickListener);
        editingBox.onkeydown = null;
    }

    eventBus.once(["directEditing.complete", "directEditing.cancel"], teardown);
}
