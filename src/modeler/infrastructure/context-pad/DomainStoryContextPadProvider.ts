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
import { ColorPickerCoordinator } from "../color-picker/ColorPickerCoordinator";
import { numberingOnDirectionChange } from "../../../story/domain/activityNumbering";

/**
 * Positions the replace menu below the open context pad. Queries the DOM because
 * the deprecated `ContextPad#getPad()` warns and can create a stray pad; scoped
 * to the container so modeler instances cannot cross-match.
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

/** Resolve the initiating control to stable browser-viewport coordinates. */
export function computeColorPickerAnchor(event: any): {
    x: number;
    y: number;
} {
    const target =
        event?.delegateTarget ?? event?.currentTarget ?? event?.target ?? null;
    const control =
        target instanceof globalThis.Element
            ? (target.closest('[data-action="colorChange"]') ?? target)
            : null;
    if (control instanceof HTMLElement) {
        const rect = control.getBoundingClientRect();
        return { x: rect.right, y: rect.top + rect.height / 2 };
    }
    return {
        x: Number(event?.clientX ?? event?.x ?? 0),
        y: Number(event?.clientY ?? event?.y ?? 0),
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
        "domainStoryColorPickerCoordinator",
        "config.domainStoryColorPicker",
    ];

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
        contextPad: ContextPad,
        private readonly popupMenu: PopupMenu,
        private readonly commandStack: CommandStack,
        eventBus: EventBus,
        private readonly colorPickerCoordinator: ColorPickerCoordinator,
        private readonly colorPickerConfig: { readonly enabled: boolean },
    ) {
        contextPad.registerProvider(this);
        popupMenu.registerProvider("ds-replace", replaceMenuProvider);

        // Below SelectionBehavior (500), whose selection opens the pad; at the
        // default priority this always sees a closed pad. bpmn-js uses 250 too.
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
    }

    getContextPadEntries(element: Element): ContextPadEntries {
        let entries: Map<string, ContextPadEntry> = new Map();

        if (isWorkObject(element)) {
            this.addDelete(entries, [element]);
            this.addColorChange(entries);
            entries.set(...this.addConnectWithActivity());
            entries.set(...this.addTextAnnotation());
            entries = new Map([...entries, ...this.addActors()]);
            entries = new Map([...entries, ...this.addWorkObjects()]);
            entries.set(...this.addChangeWorkObjectTypeMenu());
        } else if (isActor(element)) {
            this.addDelete(entries, [element]);
            this.addColorChange(entries);
            entries.set(...this.addConnectWithActivity());
            entries.set(...this.addTextAnnotation());
            entries = new Map([...entries, ...this.addWorkObjects()]);
            entries.set(...this.addChangeActorTypeMenu());
        } else if (isGroup(element)) {
            entries.set(...this.addDeleteGroupWithoutChildren());
            entries.set(...this.addTextAnnotation());
            this.addColorChange(entries);
        } else if (isActivity(element)) {
            this.addDelete(entries, [element]);
            entries.set(...this.addChangeDirection());
            this.addColorChange(entries);
        } else if (isAnnotation(element)) {
            this.addDelete(entries, [element]);
            this.addColorChange(entries);
        } else if (isConnection(element)) {
            this.addDelete(entries, [element]);
        }

        return Object.fromEntries(entries);
    }

    getMultiElementContextPadEntries(elements: Element[]): ContextPadEntries {
        const entries: Map<string, ContextPadEntry> = new Map();
        this.addDelete(entries, elements);
        this.addColorChange(entries);
        return Object.fromEntries(entries);
    }

    private startConnect(): (
        event: any,
        element: Element,
        autoActivate: boolean,
    ) => void {
        return (event: any, element: Element, autoActivate: boolean) =>
            // Connect#start treats a non-object third argument as autoActivate;
            // diagram-js' types only describe the Point overload.
            // @ts-expect-error autoActivate in the connectionStart position
            this.connect.start(event, element, autoActivate);
    }

    /** Mutates the map so a denied delete can simply omit its entry. */
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

    /** The flat `{ elements }` context diagram-js/bpmn-js rules expect. */
    private isDeleteAllowed(elements: Element[]): boolean {
        const allowed = this.rules.allowed("elements.delete", { elements });

        if (isArray(allowed)) {
            // An array verdict names the deletable subset; require all of them.
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

    private addColorChange(entries: Map<string, ContextPadEntry>): void {
        if (!this.colorPickerConfig.enabled) return;
        entries.set("colorChange", {
            group: "edit",
            className: "icon-domain-story-color-picker",
            html: '<button type="button" class="entry" aria-label="Change color"></button>',
            title: this.translate("Change color"),
            action: {
                click: (event: any, target: Element | Element[]) =>
                    this.colorPickerCoordinator.request(
                        target,
                        computeColorPickerAnchor(event),
                    ),
            },
        });
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
     * Computes the number the swapped activity needs (`null`, never `0`, when it
     * will start at a work object); the command writes it so undo can restore it.
     */
    private changeDirection(element: Connection) {
        const businessObject = element.businessObject;
        const source = element.source;
        const numberingDecision = numberingOnDirectionChange(source);
        const newNumber =
            numberingDecision === "clear"
                ? null
                : this.numberingRegistry.generateAutomaticNumber();
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
                dragstart: appendStart,
                click: appendStart,
            },
        };
    }
}
