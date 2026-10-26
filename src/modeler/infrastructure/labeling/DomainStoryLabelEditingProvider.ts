import { assign } from "min-dash";
import { Element, Shape } from "diagram-js/lib/model/Types";
import { Rect } from "diagram-js/lib/util/Types";
import Canvas from "diagram-js/lib/core/Canvas";
import EventBus from "diagram-js/lib/core/EventBus";
import {
    DirectEditing,
    DirectEditingProvider,
} from "diagram-js-direct-editing";
import ResizeHandles from "diagram-js/lib/features/resize/ResizeHandles";
import CommandStack from "diagram-js/lib/command/CommandStack";

import { DomainStoryModeling } from "../modeling/DomainStoryModeling";
import { DomainStoryTextRenderer } from "../text-renderer/DomainStoryTextRenderer";
import { LabelDictionaryService } from "../../../labelDictionary/service";
import { ElementTypes } from "../../../story/domain/elementTypes";
import { DomainStoryUpdateLabelHandler } from "./handler/DomainStoryUpdateLabelHandler";
import { isActor, isWorkObject } from "../../../story/domain/elementPredicates";
import { getBusinessObject, is } from "../../../shared/infrastructure/util";
import { createAutocompleteForEdit, getLabel } from "./utils";
import { canEditLabel } from "../../../story/domain/labelPolicy";

export function focusElement(element: HTMLDivElement) {
    // Deferred as a workaround: after a host (Angular) dialog opened, a
    // synchronous focus is lost. The root cause is unknown.
    setTimeout(() => element.focus(), 0);
}

export class DomainStoryLabelEditingProvider implements DirectEditingProvider {
    static $inject: string[] = [
        "modeling",
        "domainStoryTextRenderer",
        "domainStoryLabelDictionaryService",
        "eventBus",
        "canvas",
        "directEditing",
        "resizeHandles",
        "commandStack",
    ];

    constructor(
        private readonly modeling: DomainStoryModeling,
        private readonly domainStoryTextRenderer: DomainStoryTextRenderer,
        private readonly labelDictionaryService: LabelDictionaryService,
        private readonly eventBus: EventBus,
        private readonly canvas: Canvas,
        private readonly directEditing: DirectEditing,
        resizeHandles: ResizeHandles,
        commandStack: CommandStack,
    ) {
        commandStack.registerHandler(
            "element.updateLabel",
            DomainStoryUpdateLabelHandler,
        );

        this.directEditing.registerProvider(this);

        eventBus.on("element.dblclick", (event: any) => {
            this.activateDirectEdit(event.element);
            if (is(event.element, ElementTypes.ACTIVITY)) {
                // Activities are edited in the numbering popup instead.
                this.directEditing.complete();
            }
        });

        eventBus.on(
            [
                "element.mousedown",
                "drag.init",
                "canvas.viewbox.changing",
                "popupMenu.open",
            ],
            () => {
                if (this.directEditing.isActive()) {
                    this.directEditing.complete();
                }
            },
        );

        eventBus.on(["commandStack.changed"], () => {
            if (this.directEditing.isActive()) {
                this.directEditing.cancel();
            }
        });

        eventBus.on("directEditing.activate", (event: any) => {
            resizeHandles.removeResizers();
            const element = event.active.element;
            this.createAutocomplete(element);
        });

        eventBus.on("create.end", 500, (event: any) => {
            const element = event.shape,
                canExecute = event.context.canExecute;

            if (!canExecute) {
                return;
            }
            // A paste (`createElementsBehavior: false`) is already labelled.
            if (event.context.hints?.createElementsBehavior === false) {
                return;
            }
            if (!is(element, ElementTypes.ACTIVITY)) {
                this.activateDirectEdit(element);
            }
            const editingBox = document.getElementsByClassName(
                "djs-direct-editing-content",
            );
            focusElement(editingBox.item(0) as HTMLDivElement);
        });
    }

    activate(element: Shape): any {
        const semanticObject = getBusinessObject(element);
        if (!canEditLabel(element, semanticObject)) {
            return;
        }
        const text = getLabel(element);

        if (text === undefined) {
            return;
        }

        const context = {
            text: text,
        };

        const bounds = this.getEditingBBox(element);

        assign(context, bounds);

        const options = {};

        if (is(element, ElementTypes.TEXTANNOTATION)) {
            assign(options, {
                resizable: true,
                autoResize: true,
            });
        }

        assign(context, {
            options: options,
        });

        return context;
    }

    getEditingBBox(element: Shape) {
        const target = element.label || element;

        const bbox = this.canvas.getAbsoluteBBox(target);

        const bounds = { x: bbox.x, y: bbox.y };

        /** diagram-js `Canvas.zoom()`, not the deprecated DOM `zoom` an IDE may flag. */
        const zoom = this.canvas.zoom();
        const defaultStyle = this.domainStoryTextRenderer.getDefaultStyle();

        // take zoom into account
        const defaultFontSize = (defaultStyle?.fontSize ?? 1) * zoom,
            defaultLineHeight = defaultStyle?.lineHeight;

        const style = {
            fontFamily:
                this.domainStoryTextRenderer.getDefaultStyle()?.fontFamily,
            fontWeight:
                this.domainStoryTextRenderer.getDefaultStyle()?.fontWeight,
        };

        if (is(element, ElementTypes.GROUP)) {
            assign(bounds, {
                minWidth: bbox.width / 2.5 > 125 ? bbox.width / 2.5 : 125,
                maxWidth: bbox.width,
                minHeight: 30 * zoom,
                x: bbox.x,
                y: bbox.y,
            });

            assign(style, {
                fontSize: defaultFontSize + "px",
                lineHeight: defaultLineHeight,
                paddingTop: 7 * zoom + "px",
                paddingBottom: 7 * zoom + "px",
                paddingLeft: 5 * zoom + "px",
                paddingRight: 5 * zoom + "px",
                textAlign: "left",
            });
        }

        if (isActor(element) || isWorkObject(element)) {
            assign(bounds, {
                width: bbox.width,
                minHeight: 30,
                y: bbox.y + bbox.height - 20,
                x: bbox.x,
            });

            assign(style, {
                fontSize: defaultFontSize + "px",
                lineHeight: defaultLineHeight,
                paddingTop: 7 * zoom + "px",
                paddingBottom: 7 * zoom + "px",
                paddingLeft: 5 * zoom + "px",
                paddingRight: 5 * zoom + "px",
            });
        }

        if (is(element, ElementTypes.TEXTANNOTATION)) {
            assign(bounds, {
                width: bbox.width,
                height: bbox.height,
                minWidth: 30 * zoom,
                minHeight: 10 * zoom,
            });

            assign(style, {
                textAlign: "left",
                paddingTop: 7 * zoom + "px",
                paddingBottom: 7 * zoom + "px",
                paddingLeft: 5 * zoom + "px",
                paddingRight: 5 * zoom + "px",
                fontSize: defaultFontSize + "px",
                lineHeight: defaultLineHeight,
            });
        }

        return { bounds: bounds, style: style };
    }

    /**
     * `_oldText` is unused but must stay: DirectEditing calls
     * `update(element, newText, oldText, bounds)`. Only a text annotation takes
     * bounds from the edit box; others let the label handler lay out the label.
     */
    update(element: Shape, newLabel: string, _oldText: string, bounds: Rect) {
        const bbox = this.canvas.getAbsoluteBBox(element);

        let newBounds: Rect | undefined;
        if (is(element, ElementTypes.TEXTANNOTATION)) {
            newBounds = {
                x: element.x,
                y: element.y,
                width: (element.width / bbox.width) * bounds.width,
                height: (element.height / bbox.height) * bounds.height,
            };
        }

        // Raw label: SVG-safety is an export-time concern, and sanitizing here
        // mangles input on canvas (e.g. "--" → "––").
        this.modeling.updateLabel(element, newLabel, newBounds);
    }

    private activateDirectEdit(element: Element) {
        this.directEditing.activate(element);
    }

    private createAutocomplete(element: Element) {
        const editingBox = document.getElementsByClassName(
            "djs-direct-editing-content",
        );
        focusElement(editingBox.item(0) as HTMLDivElement);
        createAutocompleteForEdit(
            editingBox[0] as HTMLElement,
            this.labelDictionaryService.getUniqueWorkObjectNames(),
            element,
            this.eventBus,
        );
    }
}
