import { describe, expect, it, vi } from "vitest";
import EventBus from "diagram-js/lib/core/EventBus";

import {
    computeReplaceMenuPosition,
    DomainStoryContextPadProvider,
} from "../DomainStoryContextPadProvider";
import { ElementTypes } from "../../../../story/domain/elementTypes";
import { DomainStoryNumberingRegistry } from "../../popup/DomainStoryNumberingRegistry";

/**
 * Regression tests for the replace ("Change type") popup positioning (issue #6,
 * upstream #265). `computeReplaceMenuPosition` replaced the deprecated
 * `ContextPad#getPad()` lookup — which warned and could spawn a stray pad DOM
 * element — with a scoped `.djs-context-pad.open` DOM query. jsdom (the global
 * test environment) supplies the DOM these functions read; because it returns
 * all-zero `getBoundingClientRect()` by default, both rects are stubbed so the
 * pad-relative offset math is observable.
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

/**
 * Build a diagram container with an optional context pad child. The pad's class
 * list is caller-controlled so tests can prove the `open` class is what gates
 * the match — the stray-pad case the deprecation was steering away from.
 */
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

        // x = padLeft - containerLeft; y = padTop - containerTop + height + 5
        expect(computeReplaceMenuPosition(container)).toEqual({
            x: 30,
            y: 90 - 50 + 40 + 5,
        });
    });

    it("returns null when no context pad exists", () => {
        expect(computeReplaceMenuPosition(setup())).toBeNull();
    });

    it("ignores a pad that is not open, guarding the stray-pad case", () => {
        // A pad element without the `open` class must not be matched — this is
        // exactly the stray pad the deprecated getPad() could create.
        const container = setup({ padClassName: "djs-context-pad" });
        expect(computeReplaceMenuPosition(container)).toBeNull();
    });
});

/**
 * Behavioral tests for the host color-picker contract (issue #46, upstream
 * `e21c72ee`). The core owns no picker UI: it exposes a `colorChange` pad
 * entry and applies whatever color the host reports back via a document-level
 * `pickedColor` event. These tests drive that round-trip directly on a provider
 * instance, asserting the resulting `element.colorChange` command executions.
 *
 * Each test builds its own instance with its own `commandStack` spy; instances
 * from earlier tests are never destroyed, so their listeners fire against their
 * own (now-irrelevant) spies and never touch the spy under assertion.
 */

/** A minimal element carrying only what the color-change path reads. */
function element(id: string, type: ElementTypes, pickedColor?: string): any {
    return { id, type, businessObject: { pickedColor } };
}

/**
 * Construct a provider with just enough mocks to reach the color-change path,
 * returning the spies the tests assert on. `rules.allowed` defaults to a spy
 * answering `true`, so every entry is offered; pass an override to drive the
 * delete-rule cases.
 *
 * The event bus is the real diagram-js one, because two of the provider's
 * behaviours are about *when* its listeners run relative to diagram-js' own
 * (the ctrl-drop replace menu) and *whether* they still run at all (teardown on
 * `diagram.destroy`) — neither is observable through a stubbed `on`.
 */
function provider(rulesOverride?: { allowed: (...args: any[]) => unknown }) {
    const rules = rulesOverride ?? { allowed: vi.fn(() => true) };
    const commandStack = { execute: vi.fn(), registerHandler: vi.fn() };
    const dirtyFlagService = { makeDirty: vi.fn() };
    const connect = { start: vi.fn() };
    const replaceEntryClick = vi.fn();
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

    const instance = new DomainStoryContextPadProvider(
        {} as any, // elementFactory
        {} as any, // modeling
        {} as any, // replaceMenuProvider
        // The real registry against an empty canvas, so "does anything write to
        // the model before the command runs" is actually observable.
        new DomainStoryNumberingRegistry(eventBus, {
            getActivitiesFromActors: () => [],
        } as any),
        dirtyFlagService as any,
        // iconDictionaryService: no icons, so the append-actor/work-object
        // entries stay empty and do not obscure the entries under test.
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
    );

    return {
        instance,
        rules,
        commandStack,
        dirtyFlagService,
        connect,
        eventBus,
        replaceEntryClick,
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
    it("applies a picked color to a single selected element", () => {
        const { instance, commandStack, dirtyFlagService } = provider();
        const el = element("Annotation_1", ElementTypes.TEXTANNOTATION);

        instance.getContextPadEntries(el);
        document.dispatchEvent(
            new CustomEvent("pickedColor", { detail: { color: "#ff0000" } }),
        );

        expect(commandStack.execute).toHaveBeenCalledTimes(1);
        expect(commandStack.execute).toHaveBeenCalledWith(
            "element.colorChange",
            {
                businessObject: el.businessObject,
                newColor: "#ff0000",
                element: el,
            },
        );
        expect(dirtyFlagService.makeDirty).toHaveBeenCalledTimes(1);
    });

    it("applies a picked color once per element on multi-select", () => {
        const { instance, commandStack, dirtyFlagService } = provider();
        const el1 = element("Annotation_1", ElementTypes.TEXTANNOTATION);
        const el2 = element("Actor_1", ElementTypes.ACTOR);

        instance.getMultiElementContextPadEntries([el1, el2]);
        document.dispatchEvent(
            new CustomEvent("pickedColor", { detail: { color: "#00ff00" } }),
        );

        expect(commandStack.execute).toHaveBeenCalledTimes(2);
        expect(commandStack.execute).toHaveBeenNthCalledWith(
            1,
            "element.colorChange",
            {
                businessObject: el1.businessObject,
                newColor: "#00ff00",
                element: el1,
            },
        );
        expect(commandStack.execute).toHaveBeenNthCalledWith(
            2,
            "element.colorChange",
            {
                businessObject: el2.businessObject,
                newColor: "#00ff00",
                element: el2,
            },
        );
        // A single dirty flag for the whole multi-select gesture.
        expect(dirtyFlagService.makeDirty).toHaveBeenCalledTimes(1);
    });

    it.each([
        ["rgb(12, 128, 255)", "#0c80ffff"],
        ["rgba(12.4, 127.5, 254.6, .5)", "#0c80ff80"],
        ["rebeccapurple", "rebeccapurple"],
    ])(
        "converts picked color %s only when the previous color has hex alpha",
        (pickedColor, expected) => {
            const { instance, commandStack } = provider();
            const el = element("Actor_1", ElementTypes.ACTOR, "#12345680");

            instance.getContextPadEntries(el);
            document.dispatchEvent(
                new CustomEvent("pickedColor", {
                    detail: { color: pickedColor },
                }),
            );

            expect(commandStack.execute).toHaveBeenCalledTimes(1);
            expect(commandStack.execute).toHaveBeenCalledWith(
                "element.colorChange",
                expect.objectContaining({ newColor: expected }),
            );
            expect(
                commandStack.execute.mock.calls[0][1].newColor,
            ).not.toContain("NaN");
        },
    );

    it("converts each mixed multi-selection according to its previous color", () => {
        const { instance, commandStack } = provider();
        const alphaHex = element("Actor_1", ElementTypes.ACTOR, "#1234");
        const namedColor = element(
            "Annotation_1",
            ElementTypes.TEXTANNOTATION,
            "black",
        );

        instance.getMultiElementContextPadEntries([alphaHex, namedColor]);
        document.dispatchEvent(
            new CustomEvent("pickedColor", {
                detail: { color: "rgba(1, 2, 3, .5)" },
            }),
        );

        expect(commandStack.execute).toHaveBeenCalledTimes(2);
        expect(commandStack.execute).toHaveBeenNthCalledWith(
            1,
            "element.colorChange",
            expect.objectContaining({
                element: alphaHex,
                newColor: "#01020380",
            }),
        );
        expect(commandStack.execute).toHaveBeenNthCalledWith(
            2,
            "element.colorChange",
            expect.objectContaining({
                element: namedColor,
                newColor: "rgba(1, 2, 3, .5)",
            }),
        );
    });

    it("stops listening for picked colors once the diagram is destroyed", () => {
        const { instance, commandStack, eventBus } = provider();
        instance.getContextPadEntries(
            element("Annotation_1", ElementTypes.TEXTANNOTATION),
        );

        eventBus.fire("diagram.destroy", {});
        document.dispatchEvent(
            new CustomEvent("pickedColor", { detail: { color: "#ff0000" } }),
        );

        expect(commandStack.execute).not.toHaveBeenCalled();
    });

    it("offers a colorChange entry for multi-selections", () => {
        const { instance } = provider();

        const entries = instance.getMultiElementContextPadEntries([
            element("Annotation_1", ElementTypes.TEXTANNOTATION),
            element("Actor_1", ElementTypes.ACTOR),
        ]);

        expect(entries).toHaveProperty("colorChange");
    });
});

/**
 * The delete entry is rule-gated (issue #85). A denied delete must *omit* the
 * entry — the provider used to `throw`, and `getContextPadEntries` has no catch,
 * so a single denying `elements.delete` rule would have taken down the entire
 * context pad. The rule is also queried with the canonical flat `{ elements }`
 * context, so host rules written against bpmn-js conventions actually match.
 */
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

        // A partial verdict must not offer an entry that would delete both.
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

/**
 * The color picker lives in the host, so its answer arrives asynchronously and
 * long after the pad decided which element it acts on (issue #85). The provider
 * must therefore let go of that element whenever the pad moves on, or a reply
 * recolors a selection the user has left — possibly one already deleted, minting
 * an undo entry for a detached element.
 */
describe("DomainStoryContextPadProvider stale selection", () => {
    /** A connection: its pad branch offers delete only, never a color change. */
    function connection(id: string): any {
        return { id, type: ElementTypes.CONNECTION, businessObject: {} };
    }

    it("drops the previous element when a connection's pad opens", () => {
        const { instance, commandStack } = provider();

        instance.getContextPadEntries(element("Actor_1", ElementTypes.ACTOR));
        instance.getContextPadEntries(connection("Activity_1"));
        document.dispatchEvent(
            new CustomEvent("pickedColor", { detail: { color: "#ff0000" } }),
        );

        expect(commandStack.execute).not.toHaveBeenCalled();
    });

    it("drops the selection when the pad closes", () => {
        const { instance, commandStack, dirtyFlagService, eventBus } =
            provider();

        instance.getContextPadEntries(element("Actor_1", ElementTypes.ACTOR));
        eventBus.fire("contextPad.close", { current: {} });
        document.dispatchEvent(
            new CustomEvent("pickedColor", { detail: { color: "#ff0000" } }),
        );

        expect(commandStack.execute).not.toHaveBeenCalled();
        expect(dirtyFlagService.makeDirty).not.toHaveBeenCalled();
    });

    it("stops pre-seeding the picker with the previous element's color", () => {
        const { instance } = provider();
        const colors: string[] = [];
        const onDefaultColor = (event: any) => colors.push(event.detail.color);
        document.addEventListener("defaultColor", onDefaultColor);

        try {
            instance.getContextPadEntries(
                element("Actor_1", ElementTypes.ACTOR, "#ff0000"),
            );
            instance.getContextPadEntries(connection("Activity_1"));
        } finally {
            document.removeEventListener("defaultColor", onDefaultColor);
        }

        expect(colors).toEqual(["#ff0000", "#000000"]);
    });
});

/**
 * Changing an activity's direction has to reach the model through the command,
 * not before it: `ActivityDirectionChangedHandler.preExecute` snapshots the
 * activity's current number so an undo can put it back.
 */
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

    it("leaves the number to the command instead of minting it into the model", () => {
        const { instance, commandStack } = provider();
        const activity = workObjectSourcedActivity();
        let numberAtExecute: unknown = "not executed";
        commandStack.execute.mockImplementation(() => {
            numberAtExecute = activity.businessObject.number;
        });

        const entries = instance.getContextPadEntries(activity);
        (entries["changeDirection"].action as any).click({}, activity);

        expect(numberAtExecute).toBeNull();
        expect(commandStack.execute).toHaveBeenCalledWith(
            "activity.directionChange",
            expect.objectContaining({ newNumber: 1, element: activity }),
        );
    });
});

describe("DomainStoryContextPadProvider connect entry", () => {
    it("hands autoActivate to Connect in the slot it actually reads", () => {
        const { instance, connect } = provider();
        const el = element("Actor_1", ElementTypes.ACTOR);

        const entries = instance.getContextPadEntries(el);
        (entries["connect"].action as any).click({}, el, true);

        // Connect#start reads a non-object third argument *as* autoActivate; a
        // fourth argument is only consulted when the third is a Point.
        expect(connect.start).toHaveBeenCalledWith({}, el, true);
    });
});

/**
 * Ctrl/cmd-dropping a new element is meant to open the replace ("Change type")
 * menu straight away. That only works if the listener runs *after* the shape has
 * been selected, because it is the selection that opens the context pad —
 * diagram-js' SelectionBehavior does it at priority 500.
 */
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
