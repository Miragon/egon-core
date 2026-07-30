import { assign, isArray } from "min-dash";
import Connect from "diagram-js/lib/features/connect/Connect";
import Create from "diagram-js/lib/features/create/Create";
import Canvas from "diagram-js/lib/core/Canvas";
import ContextPad, {
    ContextPadTarget,
} from "diagram-js/lib/features/context-pad/ContextPad";
import PopupMenu from "diagram-js/lib/features/popup-menu/PopupMenu";
import CommandStack from "diagram-js/lib/command/CommandStack";
import EventBus from "diagram-js/lib/core/EventBus";
import ContextPadProvider, {
    ContextPadEntries,
    ContextPadEntry,
} from "diagram-js/lib/features/context-pad/ContextPadProvider";
import { Connection, Element } from "diagram-js/lib/model/Types";
import { hasPrimaryModifier } from "diagram-js/lib/util/Mouse";
import Rules from "diagram-js/lib/features/rules/Rules";

import { DomainStoryElementFactory } from "../element-factory/DomainStoryElementFactory";
import { DomainStoryModeling } from "../modeling/DomainStoryModeling";
import { DomainStoryReplaceMenuProvider } from "../replace/DomainStoryReplaceMenuProvider";
import { DirtyFlagService } from "../../service/DirtyFlagService";
import { IconDictionaryService } from "../../../iconSet/service";
import {
    hexToRGBA,
    isHexWithAlpha,
    rgbaToHex,
} from "../../../shared/domain/colorConverter";
import { ElementTypes } from "../../../story/domain/elementTypes";
import {
    isActivity,
    isActor,
    isAnnotation,
    isConnection,
    isGroup,
    isWorkObject,
} from "../../../story/domain/elementPredicates";
import { DomainStoryNumberingRegistry } from "../popup/DomainStoryNumberingRegistry";

/**
 * Positions the replace ("Change type") popup menu just below the open context
 * pad. Queries the live DOM instead of the deprecated ContextPad#getPad(),
 * which warns and can create a stray pad element as a side effect
 * (diagram-js#888). Scoped to the diagram container so multiple modeler
 * instances on one page cannot cross-match. Returns null when no pad is open,
 * leaving the caller to fall back to the cursor position.
 */
export function computeReplaceMenuPosition(
    diagramContainer: HTMLElement,
): { x: number; y: number } | null {
    const Y_OFFSET = 5;
    const pad = diagramContainer.querySelector(".djs-context-pad.open");
    if (!pad) {
        return null;
    }
    const diagramRect = diagramContainer.getBoundingClientRect();
    const padRect = pad.getBoundingClientRect();
    return {
        x: padRect.left - diagramRect.left,
        y: padRect.top - diagramRect.top + padRect.height + Y_OFFSET,
    };
}

export class DomainStoryContextPadProvider implements ContextPadProvider<Element> {
    static $inject: string[] = [
        "elementFactory",
        "modeling",
        "domainStoryReplaceMenuProvider",
        "domainStoryNumberingRegistry",
        "domainStoryDirtyFlagService",
        "domainStoryIconDictionaryService",
        "rules",
        "connect",
        "translate",
        "create",
        "canvas",
        "contextPad",
        "popupMenu",
        "commandStack",
        "eventBus",
    ];

    private selectedElement: Element | Element[] | undefined;

    constructor(
        private readonly elementFactory: DomainStoryElementFactory,
        private readonly modeling: DomainStoryModeling,
        replaceMenuProvider: DomainStoryReplaceMenuProvider,
        private readonly numberingRegistry: DomainStoryNumberingRegistry,
        private readonly dirtyFlagService: DirtyFlagService,
        private readonly iconDictionaryService: IconDictionaryService,
        private readonly rules: Rules,
        private readonly connect: Connect,
        private readonly translate: any,
        private readonly create: Create,
        private readonly canvas: Canvas,
        // Injected only to wire up the provider and read live pad state in the
        // constructor; no longer stored, since the deprecated getPad() lookup
        // that used `this.contextPad` was replaced by a DOM query.
        contextPad: ContextPad,
        private readonly popupMenu: PopupMenu,
        private readonly commandStack: CommandStack,
        eventBus: EventBus,
    ) {
        contextPad.registerProvider(this);
        popupMenu.registerProvider("ds-replace", replaceMenuProvider);

        // Priority 250, below diagram-js' SelectionBehavior (500): it is the
        // selection of the new shape that makes ContextPad open it. At the
        // default 1000 this ran first and always saw a closed pad, so the
        // ctrl-drop "open replace menu" gesture silently did nothing. bpmn-js
        // registers the same listener at 250 for the same reason.
        eventBus.on("create.end", 250, (event: any) => {
            const context = event.context,
                shape = context.shape;

            if (!hasPrimaryModifier(event) || !contextPad.isOpen(shape)) {
                return;
            }

            const entries = contextPad.getEntries(shape);

            if (entries["replace"]) {
                // @ts-expect-error Action has attribute "click"
                entries["replace"].action.click(event, shape);
            }
        });

        // The host owns the color picker, so its answer arrives as a
        // document-level event rather than through the event bus. That makes it
        // this instance's job to let go again on teardown: otherwise a stale
        // listener keeps executing commands on a destroyed command stack, and
        // two live modelers both react to one picker event.
        const onPickedColor = (event: any) => {
            if (this.selectedElement) {
                this.executeCommandStack(event);
            }
        };
        document.addEventListener("pickedColor", onPickedColor);
        eventBus.on("diagram.destroy", () =>
            document.removeEventListener("pickedColor", onPickedColor),
        );

        // Picker replies are async and can arrive after the pad closed; letting
        // go of the selection turns them into no-ops instead of recoloring a
        // possibly-deleted element. Safe against a fresh selection because
        // ContextPad#open() closes before it repopulates the providers.
        eventBus.on("contextPad.close", () => {
            this.selectedElement = undefined;
        });
    }

    getContextPadEntries(element: Element): ContextPadEntries {
        // Drop the previous selection before any branch runs: only branches that
        // offer a color change re-record one, so a connection (delete only) must
        // not leave the last shape reachable for the picker.
        this.selectedElement = undefined;
        let entries: Map<string, ContextPadEntry> = new Map();

        if (isWorkObject(element)) {
            this.addDelete(entries, [element]);
            entries.set(...this.addColorChange(element));
            entries.set(...this.addConnectWithActivity());
            entries.set(...this.addTextAnnotation());
            entries = new Map([...entries, ...this.addActors()]);
            entries = new Map([...entries, ...this.addWorkObjects()]);
            entries.set(...this.addChangeWorkObjectTypeMenu());
        } else if (isActor(element)) {
            this.addDelete(entries, [element]);
            entries.set(...this.addColorChange(element));
            entries.set(...this.addConnectWithActivity());
            entries.set(...this.addTextAnnotation());
            entries = new Map([...entries, ...this.addWorkObjects()]);
            entries.set(...this.addChangeActorTypeMenu());
        } else if (isGroup(element)) {
            entries.set(...this.addDeleteGroupWithoutChildren());
            entries.set(...this.addTextAnnotation());
            entries.set(...this.addColorChange(element));
        } else if (isActivity(element)) {
            this.addDelete(entries, [element]);
            entries.set(...this.addChangeDirection());
            entries.set(...this.addColorChange(element));
        } else if (isAnnotation(element)) {
            this.addDelete(entries, [element]);
            entries.set(...this.addColorChange(element));
        } else if (isConnection(element)) {
            this.addDelete(entries, [element]);
        }

        this.notifyColorPickerOfCurrentElementColor();

        return Object.fromEntries(entries);
    }

    getMultiElementContextPadEntries(elements: Element[]): ContextPadEntries {
        this.selectedElement = undefined;
        const entries: Map<string, ContextPadEntry> = new Map();
        this.addDelete(entries, elements);
        entries.set(...this.addColorChange(elements));
        return Object.fromEntries(entries);
    }

    /**
     * Pre-seeds the host's color picker with the current selection's color so
     * it opens on the right swatch. Only a single selected element carries a
     * meaningful color; a multi-select (array) or an absent selection (the
     * CONNECTION branch never calls addColorChange) falls back to black.
     */
    private notifyColorPickerOfCurrentElementColor() {
        let pickedColor: string | undefined;
        if (this.selectedElement && !isArray(this.selectedElement)) {
            pickedColor = this.selectedElement.businessObject.pickedColor;
        }

        if (isHexWithAlpha(pickedColor)) {
            pickedColor = hexToRGBA(pickedColor!);
        }
        document.dispatchEvent(
            new CustomEvent("defaultColor", {
                detail: {
                    color: pickedColor ?? "#000000",
                },
            }),
        );
    }

    private executeCommandStack(colorChangedEvent: any) {
        const newColor = colorChangedEvent.detail.color;

        if (isArray(this.selectedElement)) {
            // One execute per element keeps each recolor as its own undo step,
            // matching upstream multi-select behavior.
            this.selectedElement.forEach((element) => {
                this.commandStack.execute(
                    "element.colorChange",
                    this.getColorChangeDescription(element, newColor),
                );
            });
        } else if (this.selectedElement) {
            this.commandStack.execute(
                "element.colorChange",
                this.getColorChangeDescription(this.selectedElement, newColor),
            );
        }

        this.dirtyFlagService.makeDirty();
    }

    private getColorChangeDescription(element: Element, newColor: string) {
        const oldColor = element.businessObject.pickedColor;
        if (isHexWithAlpha(oldColor)) {
            newColor = rgbaToHex(newColor);
        }

        return {
            businessObject: element.businessObject,
            newColor: newColor,
            element: element,
        };
    }

    private startConnect(): (
        event: any,
        element: Element,
        autoActivate: boolean,
    ) => void {
        return (event: any, element: Element, autoActivate: boolean) =>
            // Three arguments, deliberately: Connect#start treats a non-object
            // third argument *as* autoActivate and defaults connectionStart to
            // the element's mid (Connect.js:131). Passing an explicit
            // `undefined` in that slot swallowed the flag. diagram-js' types
            // only describe the Point overload.
            // @ts-expect-error autoActivate in the connectionStart position
            this.connect.start(event, element, autoActivate);
    }

    /**
     * Mutates the entry map instead of returning a tuple, because a denied
     * delete has to mean "omit this one entry". Returning a tuple left no way to
     * say that, so the previous code threw — and `getContextPadEntries` has no
     * catch, so one denying rule would have taken down the whole pad.
     */
    private addDelete(
        entries: Map<string, ContextPadEntry>,
        elements: Element[],
    ): void {
        if (!this.isDeleteAllowed(elements)) {
            return;
        }

        entries.set("delete", {
            group: "edit",
            className: "bpmn-icon-trash",
            title: this.translate("Remove"),
            action: {
                click: (_event: any, element: ContextPadTarget) => {
                    if (isArray(element)) {
                        const groups = element.filter((el) => isGroup(el));
                        const otherElements = element.filter(
                            (el) => !isGroup(el),
                        );
                        groups.forEach((group) =>
                            this.modeling.removeGroup(group),
                        );
                        this.modeling.removeElements(otherElements.slice());
                    } else {
                        this.modeling.removeElements([element]);
                    }
                    this.dirtyFlagService.makeDirty();
                },
            },
        });
    }

    /**
     * Asks the rules whether the selection may be deleted, using the canonical
     * flat `{ elements }` context so rules written against diagram-js/bpmn-js
     * conventions apply unchanged (the previous nested `{ elements: { element } }`
     * shape matched nothing).
     */
    private isDeleteAllowed(elements: Element[]): boolean {
        const allowed = this.rules.allowed("elements.delete", { elements });

        if (isArray(allowed)) {
            // An array verdict names the deletable subset; offer delete only
            // when every requested element came back, so the entry never
            // deletes more than the rule sanctioned.
            return (
                allowed.length === elements.length &&
                elements.every((element) => allowed.includes(element))
            );
        }

        return !!allowed;
    }

    private addDeleteGroupWithoutChildren(): [string, ContextPadEntry<any>] {
        return [
            "deleteGroup",
            {
                group: "edit",
                className: "bpmn-icon-trash",
                title: this.translate("Remove Group without Child-Elements"),
                action: {
                    click: (_event, element: Element) => {
                        this.modeling.removeGroup(element);
                        this.dirtyFlagService.makeDirty();
                    },
                },
            },
        ];
    }

    private addChangeDirection(): [string, ContextPadEntry<any>] {
        return [
            "changeDirection",
            {
                group: "edit",
                className: "icon-domain-story-changeDirection",
                title: this.translate("Change direction"),
                action: {
                    // event needs to be addressed
                    click: (_event: any, element: Connection) => {
                        this.changeDirection(element);
                        this.dirtyFlagService.makeDirty();
                    },
                },
            },
        ];
    }

    private addChangeActorTypeMenu(): [string, ContextPadEntry<any>] {
        return [
            "replace",
            {
                group: "edit",
                className: "bpmn-icon-screw-wrench",
                title: this.translate("Change type"),
                action: {
                    click: (event: any, element: ContextPadTarget) => {
                        const position = assign(
                            this.getReplaceMenuPosition() ?? {
                                x: event.x,
                                y: event.y,
                            },
                            {
                                cursor: { x: event.x, y: event.y },
                            },
                        );
                        this.popupMenu.open(element, "ds-replace", position);
                    },
                },
            },
        ];
    }

    private addColorChange(
        elements: Element | Element[],
    ): [string, ContextPadEntry<any>] {
        // Record which element(s) the picker acts on; the document-level
        // "pickedColor" listener reads this back when the host reports a color.
        this.selectedElement = elements;
        return [
            "colorChange",
            {
                group: "edit",
                className: "icon-domain-story-color-picker",
                title: this.translate("Change color"),
                action: {
                    click: function () {
                        document.dispatchEvent(
                            new CustomEvent("openColorPicker"),
                        );
                    },
                },
            },
        ];
    }

    private addTextAnnotation(): [string, ContextPadEntry<any>] {
        return [
            "append.text-annotation",
            this.appendAction(
                ElementTypes.TEXTANNOTATION,
                "bpmn-icon-text-annotation",
                "textannotation",
                "connect",
            ),
        ];
    }

    private addConnectWithActivity(): [string, ContextPadEntry<any>] {
        return [
            "connect",
            {
                group: "connect",
                className: "bpmn-icon-connection",
                title: this.translate("Connect with activity"),
                action: {
                    click: this.startConnect(),
                    dragstart: this.startConnect(),
                },
            },
        ];
    }

    private addWorkObjects(): Map<string, ContextPadEntry> {
        const workObjects = this.iconDictionaryService.getIconsAssignedAs(
            ElementTypes.WORKOBJECT,
        );
        const entries: Map<string, ContextPadEntry> = new Map();
        workObjects.keysArray().forEach((workObjectType) => {
            const name = workObjectType;
            const icon =
                this.iconDictionaryService.getCSSClassOfIcon(workObjectType);
            entries.set(
                "append.workObject" + name,
                this.appendAction(
                    `${ElementTypes.WORKOBJECT}${workObjectType}`,
                    icon,
                    name,
                    "workObjects",
                ),
            );
        });
        return entries;
    }

    private addActors(): Map<string, ContextPadEntry> {
        const actors = this.iconDictionaryService.getIconsAssignedAs(
            ElementTypes.ACTOR,
        );
        const entries: Map<string, ContextPadEntry> = new Map();
        actors.keysArray().forEach((actorType) => {
            const name = actorType;
            const icon =
                this.iconDictionaryService.getCSSClassOfIcon(actorType);
            entries.set(
                "append.actor" + name,
                this.appendAction(
                    `${ElementTypes.ACTOR}${actorType}`,
                    icon,
                    name,
                    "actors",
                ),
            );
        });
        return entries;
    }

    private addChangeWorkObjectTypeMenu(): [string, ContextPadEntry<any>] {
        return [
            "replace",
            {
                group: "edit",
                className: "bpmn-icon-screw-wrench",
                title: this.translate("Change type"),
                action: {
                    click: (event: any, element: ContextPadTarget) => {
                        const position = assign(
                            this.getReplaceMenuPosition() ?? {
                                x: event.x,
                                y: event.y,
                            },
                            {
                                cursor: { x: event.x, y: event.y },
                            },
                        );
                        this.popupMenu.open(element, "ds-replace", position);
                    },
                },
            },
        ];
    }

    /**
     * Swaps an activity's ends, and hands the command the number the *swapped*
     * activity will need: none when an actor is the current source (after the
     * swap it starts at a work object), a freshly minted one otherwise.
     *
     * "None" is `null`, not `0` (#74). The `0` this used to pass was overwritten
     * with `null` by the repaint that followed; now that drawing no longer writes
     * to the model, it would be exported verbatim as `"number": 0`.
     *
     * The number is only *computed* here and travels in the command context —
     * `ActivityDirectionChangedHandler` performs the write, so its `preExecute`
     * snapshots the number the activity really had and an undo restores it.
     */
    private changeDirection(element: Connection) {
        const businessObject = element.businessObject;
        const source = element.source;
        let newNumber: number | null;

        if (isActor(source)) {
            newNumber = null;
        } else {
            newNumber = this.numberingRegistry.generateAutomaticNumber();
        }
        const context = {
            businessObject: businessObject,
            newNumber: newNumber,
            element: element,
        };
        this.commandStack.execute("activity.directionChange", context);
    }

    private getReplaceMenuPosition() {
        return computeReplaceMenuPosition(this.canvas.getContainer());
    }

    private appendAction(
        type: string,
        className: string,
        title: any,
        group: string,
        options?: any,
    ): ContextPadTarget<any> {
        if (typeof title !== "string") {
            options = title;
            title = this.translate("{type}", {
                type: type.replace(/^domainStory:/, ""),
            });
        }

        const appendStart = (event: any, element: any) => {
            const shape = this.elementFactory.createShape(
                assign({ type: type }, options),
            );
            const context = {
                elements: [shape],
                hints: {},
                source: element,
            };
            this.create.start(event, shape, context);
        };

        return {
            group: group,
            className: className,
            title: "Append " + title,
            action: {
                dragstart: this.startConnect(),
                click: appendStart,
            },
        };
    }
}
