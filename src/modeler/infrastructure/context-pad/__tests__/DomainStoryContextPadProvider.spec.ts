import { describe, expect, it, vi } from "vitest";
import EventBus from "diagram-js/lib/core/EventBus";

import {
    computeColorPickerAnchor,
    computeReplaceMenuPosition,
    DomainStoryContextPadProvider,
} from "../DomainStoryContextPadProvider";
import { ElementTypes } from "../../../../story/domain/elementTypes";
import { DomainStoryNumberingRegistry } from "../../popup/DomainStoryNumberingRegistry";

/**
 * Unit tier on jsdom. jsdom returns all-zero `getBoundingClientRect()`, so the
 * rects are stubbed to make the offset math observable.
 */

/** A DOMRect stub carrying only the fields the position math consumes. */
function rect(values: Partial<DOMRect>): () => DOMRect {
    return () =>
        ({
            left: 0,
            top: 0,
            width: 0,
            height: 0,
            ...values,
        }) as DOMRect;
}

/** The pad's class list is caller-controlled to prove `open` gates the match. */
function setup(
    options: {
        padClassName?: string;
        containerRect?: Partial<DOMRect>;
        padRect?: Partial<DOMRect>;
    } = {},
): HTMLElement {
    const container = document.createElement("div");
    container.getBoundingClientRect = rect(options.containerRect ?? {});

    if (options.padClassName !== undefined) {
        const pad = document.createElement("div");
        pad.className = options.padClassName;
        pad.getBoundingClientRect = rect(options.padRect ?? {});
        container.appendChild(pad);
    }

    return container;
}

describe("computeReplaceMenuPosition", () => {
    it("positions the menu below the open pad, relative to the container", () => {
        const container = setup({
            padClassName: "djs-context-pad open",
            containerRect: { left: 100, top: 50 },
            padRect: { left: 130, top: 90, height: 40 },
        });

        expect(computeReplaceMenuPosition(container)).toEqual({
            x: 30,
            y: 90 - 50 + 40 + 5,
        });
    });

    it("returns null when no context pad exists", () => {
        expect(computeReplaceMenuPosition(setup())).toBeNull();
    });

    it("ignores a pad that is not open, guarding the stray-pad case", () => {
        // The deprecated getPad() could leave such a stray pad behind.
        const container = setup({ padClassName: "djs-context-pad" });
        expect(computeReplaceMenuPosition(container)).toBeNull();
    });
});

describe("computeColorPickerAnchor", () => {
    it("anchors to the initiating color control's right-center", () => {
        const control = document.createElement("button");
        control.dataset["action"] = "colorChange";
        control.getBoundingClientRect = rect({
            left: 100,
            top: 40,
            width: 30,
            height: 20,
            right: 130,
        });
        const child = document.createElement("span");
        control.appendChild(child);

        expect(computeColorPickerAnchor({ target: child })).toEqual({
            x: 130,
            y: 50,
        });
    });

    it("falls back to cursor coordinates when no DOM control initiated it", () => {
        expect(computeColorPickerAnchor({ clientX: 12, clientY: 34 })).toEqual({
            x: 12,
            y: 34,
        });
    });
});

/** The provider only hands the pad target to the coordinator (ADR EDT-2). */

function element(id: string, type: ElementTypes, pickedColor?: string): any {
    return { id, type, businessObject: { pickedColor } };
}

/** A real event bus: ctrl-drop depends on listener priority order. */
function provider(
    rulesOverride?: { allowed: (...args: any[]) => unknown },
    colorPickerEnabled = true,
) {
    const rules = rulesOverride ?? { allowed: vi.fn(() => true) };
    const commandStack = { execute: vi.fn(), registerHandler: vi.fn() };
    const dirtyFlagService = { makeDirty: vi.fn() };
    const connect = { start: vi.fn() };
    const replaceEntryClick = vi.fn();
    const colorPickerCoordinator = { request: vi.fn() };
    const eventBus = new EventBus();

    // Stands in for ContextPad: opened by whoever selects the created shape.
    let padOpen = false;
    const contextPad = {
        registerProvider: () => undefined,
        isOpen: () => padOpen,
        getEntries: () => ({
            replace: { action: { click: replaceEntryClick } },
        }),
    };

    const numberingRegistry = new DomainStoryNumberingRegistry(eventBus, {
        getActivitiesFromActors: () => [],
    } as any);
    const generateAutomaticNumber = vi.spyOn(
        numberingRegistry,
        "generateAutomaticNumber",
    );

    const instance = new DomainStoryContextPadProvider(
        {} as any, // elementFactory
        {} as any, // modeling
        {} as any, // replaceMenuProvider
        // Real registry on an empty canvas, so writes before the command show.
        numberingRegistry,
        dirtyFlagService as any,
        // iconDictionaryService: no icons, so no append entries.
        {
            getIconsAssignedAs: () => ({ keysArray: () => [] }),
            getCSSClassOfIcon: () => "",
        } as any,
        rules as any,
        connect as any,
        (text: string) => text, // translate (identity)
        {} as any, // create
        {} as any, // canvas
        contextPad as any,
        { registerProvider: () => undefined } as any, // popupMenu
        commandStack as any,
        eventBus,
        colorPickerCoordinator as any,
        { enabled: colorPickerEnabled },
    );

    return {
        instance,
        rules,
        commandStack,
        dirtyFlagService,
        connect,
        eventBus,
        replaceEntryClick,
        colorPickerCoordinator,
        generateAutomaticNumber,
        openPadOnSelection: () => {
            padOpen = true;
        },
    };
}

/** A ctrl/cmd-held primary-button drop, the gesture `hasPrimaryModifier` reads. */
function primaryModifierDrop(shape: any) {
    return {
        button: 0,
        ctrlKey: true,
        metaKey: true,
        context: { shape },
        shape,
    };
}

describe("DomainStoryContextPadProvider color change", () => {
    it("opens a client-scoped request only when the color entry is clicked", () => {
        const { instance, colorPickerCoordinator } = provider();
        const el = element("Actor_1", ElementTypes.ACTOR);

        const entries = instance.getContextPadEntries(el);
        expect(colorPickerCoordinator.request).not.toHaveBeenCalled();

        (entries["colorChange"].action as any).click({}, el);

        expect(colorPickerCoordinator.request).toHaveBeenCalledWith(el, {
            x: 0,
            y: 0,
        });
    });

    it("passes the complete multi-selection to the coordinator", () => {
        const { instance, colorPickerCoordinator } = provider();
        const el1 = element("Annotation_1", ElementTypes.TEXTANNOTATION);
        const el2 = element("Actor_1", ElementTypes.ACTOR);
        const elements = [el1, el2];

        const entries = instance.getMultiElementContextPadEntries(elements);
        (entries["colorChange"].action as any).click({}, elements);

        expect(colorPickerCoordinator.request).toHaveBeenCalledWith(elements, {
            x: 0,
            y: 0,
        });
    });

    it("offers a colorChange entry for multi-selections", () => {
        const { instance } = provider();

        const entries = instance.getMultiElementContextPadEntries([
            element("Annotation_1", ElementTypes.TEXTANNOTATION),
            element("Actor_1", ElementTypes.ACTOR),
        ]);

        expect(entries).toHaveProperty("colorChange");
    });

    it("omits color actions when the client disables its picker", () => {
        const { instance } = provider(undefined, false);

        expect(
            instance.getContextPadEntries(
                element("Actor_1", ElementTypes.ACTOR),
            ),
        ).not.toHaveProperty("colorChange");
        expect(
            instance.getMultiElementContextPadEntries([
                element("Actor_1", ElementTypes.ACTOR),
                element("Annotation_1", ElementTypes.TEXTANNOTATION),
            ]),
        ).not.toHaveProperty("colorChange");
    });
});

/** A denied delete must omit only its entry, never break the whole pad. */
describe("DomainStoryContextPadProvider delete entry", () => {
    it("omits delete but keeps the rest of the pad when the rule denies", () => {
        const { instance } = provider({ allowed: () => false });

        const entries = instance.getContextPadEntries(
            element("Actor_1", ElementTypes.ACTOR),
        );

        expect(entries).not.toHaveProperty("delete");
        expect(entries).toHaveProperty("colorChange");
        expect(entries).toHaveProperty("connect");
    });

    it("omits delete but keeps the multi-select pad when the rule denies", () => {
        const { instance } = provider({ allowed: () => false });

        const entries = instance.getMultiElementContextPadEntries([
            element("Actor_1", ElementTypes.ACTOR),
            element("Annotation_1", ElementTypes.TEXTANNOTATION),
        ]);

        expect(entries).not.toHaveProperty("delete");
        expect(entries).toHaveProperty("colorChange");
    });

    it("queries the rule with the canonical flat elements context", () => {
        const { instance, rules } = provider();
        const el = element("Actor_1", ElementTypes.ACTOR);

        instance.getContextPadEntries(el);

        expect(rules.allowed).toHaveBeenCalledWith("elements.delete", {
            elements: [el],
        });
    });

    it("passes the whole selection for a multi-select", () => {
        const { instance, rules } = provider();
        const el1 = element("Actor_1", ElementTypes.ACTOR);
        const el2 = element("Annotation_1", ElementTypes.TEXTANNOTATION);

        instance.getMultiElementContextPadEntries([el1, el2]);

        expect(rules.allowed).toHaveBeenCalledWith("elements.delete", {
            elements: [el1, el2],
        });
    });

    it("reads an array verdict as the deletable subset", () => {
        const el = element("Actor_1", ElementTypes.ACTOR);

        expect(
            provider({ allowed: () => [el] }).instance.getContextPadEntries(el),
        ).toHaveProperty("delete");
        expect(
            provider({ allowed: () => [] }).instance.getContextPadEntries(el),
        ).not.toHaveProperty("delete");
    });

    it("requires every multi-selected element in an array verdict", () => {
        const el1 = element("Actor_1", ElementTypes.ACTOR);
        const el2 = element("Annotation_1", ElementTypes.TEXTANNOTATION);

        expect(
            provider({
                allowed: () => [el1],
            }).instance.getMultiElementContextPadEntries([el1, el2]),
        ).not.toHaveProperty("delete");
        expect(
            provider({
                allowed: () => [el1, el2],
            }).instance.getMultiElementContextPadEntries([el1, el2]),
        ).toHaveProperty("delete");
    });

    it("keeps the group pad's own delete entry, which is rule-exempt", () => {
        const { instance } = provider({ allowed: () => false });

        const entries = instance.getContextPadEntries(
            element("Group_1", ElementTypes.GROUP),
        );

        expect(entries).toHaveProperty("deleteGroup");
    });
});

describe("DomainStoryContextPadProvider legacy picker events", () => {
    it("ignores pickedColor, openColorPicker, and defaultColor events", () => {
        const { instance, commandStack, colorPickerCoordinator } = provider();
        instance.getContextPadEntries(element("Actor_1", ElementTypes.ACTOR));
        document.dispatchEvent(
            new CustomEvent("pickedColor", { detail: { color: "#ff0000" } }),
        );
        document.dispatchEvent(new CustomEvent("openColorPicker"));
        document.dispatchEvent(
            new CustomEvent("defaultColor", { detail: { color: "#000000" } }),
        );

        expect(commandStack.execute).not.toHaveBeenCalled();
        expect(colorPickerCoordinator.request).not.toHaveBeenCalled();
    });
});

/** The number must reach the model only via the command, so undo works. */
describe("DomainStoryContextPadProvider change direction", () => {
    /** A work-object-sourced activity: after the swap it starts at an actor. */
    function workObjectSourcedActivity() {
        return {
            id: "Activity_1",
            type: ElementTypes.ACTIVITY,
            businessObject: { id: "Activity_1", number: null },
            source: { type: ElementTypes.WORKOBJECT + "Document" },
            waypoints: [],
        } as any;
    }

    /** An actor-sourced activity: after the swap it becomes a response. */
    function actorSourcedActivity() {
        return {
            id: "Activity_2",
            type: ElementTypes.ACTIVITY,
            businessObject: { id: "Activity_2", number: 7 },
            source: { type: ElementTypes.ACTOR + "Person" },
            waypoints: [],
        } as any;
    }

    it("leaves the number to the command instead of minting it into the model", () => {
        const { instance, commandStack, generateAutomaticNumber } = provider();
        const activity = workObjectSourcedActivity();
        let numberAtExecute: unknown = "not executed";
        commandStack.execute.mockImplementation(() => {
            numberAtExecute = activity.businessObject.number;
        });

        const entries = instance.getContextPadEntries(activity);
        (entries["changeDirection"].action as any).click({}, activity);

        expect(numberAtExecute).toBeNull();
        expect(generateAutomaticNumber).toHaveBeenCalledTimes(1);
        expect(commandStack.execute).toHaveBeenCalledWith(
            "activity.directionChange",
            {
                businessObject: activity.businessObject,
                newNumber: 1,
                element: activity,
            },
        );
    });

    it("clears actor-sourced numbering without calling the registry", () => {
        const { instance, commandStack, generateAutomaticNumber } = provider();
        const activity = actorSourcedActivity();
        let numberAtExecute: unknown = "not executed";
        commandStack.execute.mockImplementation(() => {
            numberAtExecute = activity.businessObject.number;
        });

        const entries = instance.getContextPadEntries(activity);
        (entries["changeDirection"].action as any).click({}, activity);

        expect(numberAtExecute).toBe(7);
        expect(generateAutomaticNumber).not.toHaveBeenCalled();
        expect(commandStack.execute).toHaveBeenCalledWith(
            "activity.directionChange",
            {
                businessObject: activity.businessObject,
                newNumber: null,
                element: activity,
            },
        );
    });
});

describe("DomainStoryContextPadProvider connect entry", () => {
    it("hands autoActivate to Connect in the slot it actually reads", () => {
        const { instance, connect } = provider();
        const el = element("Actor_1", ElementTypes.ACTOR);

        const entries = instance.getContextPadEntries(el);
        (entries["connect"].action as any).click({}, el, true);

        // Connect#start reads a non-object third argument as autoActivate.
        expect(connect.start).toHaveBeenCalledWith({}, el, true);
    });
});

/** The listener must run after SelectionBehavior (500), which opens the pad. */
describe("DomainStoryContextPadProvider ctrl-drop replace menu", () => {
    it("opens the replace menu after selection has opened the pad", () => {
        const { eventBus, replaceEntryClick, openPadOnSelection } = provider();
        const shape = element("Actor_1", ElementTypes.ACTOR);
        // Stand-in for SelectionBehavior: selects, and thereby opens the pad.
        eventBus.on("create.end", 500, openPadOnSelection);

        eventBus.fire("create.end", primaryModifierDrop(shape));

        expect(replaceEntryClick).toHaveBeenCalledTimes(1);
    });

    it("stays out of the way of a plain drop", () => {
        const { eventBus, replaceEntryClick, openPadOnSelection } = provider();
        const shape = element("Actor_1", ElementTypes.ACTOR);
        eventBus.on("create.end", 500, openPadOnSelection);

        eventBus.fire("create.end", {
            button: 0,
            context: { shape },
            shape,
        });

        expect(replaceEntryClick).not.toHaveBeenCalled();
    });
});
