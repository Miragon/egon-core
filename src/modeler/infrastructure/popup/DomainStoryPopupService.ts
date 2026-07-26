import EventBus from "diagram-js/lib/core/EventBus";
import { isActivity } from "../../../story/domain/elementPredicates";
import { html, render } from "diagram-js/lib/ui";
import PopupMenu from "../../../shared/infrastructure/ui/PopupMenu";
import { ActivityCanvasObject } from "../../../story/domain/canvasObject";
import CommandStack from "diagram-js/lib/command/CommandStack";
import { ElementRegistryService } from "../../service/ElementRegistryService";
import Canvas from "diagram-js/lib/core/Canvas";

export class DomainStoryPopupService {
    static $inject: string[] = [
        "canvas",
        "eventBus",
        "commandStack",
        "domainStoryElementRegistryService",
    ];

    private popupElement: HTMLElement | null = null;
    private currentUpdateCallback:
        | ((
              label: string,
              index: number | undefined,
              isMultiple: boolean,
          ) => void)
        | null = null;

    constructor(
        private readonly canvas: Canvas,
        private readonly eventBus: EventBus,
        private readonly commandStack: CommandStack,
        private readonly elementRegistryService: ElementRegistryService,
    ) {
        this.eventBus.on("element.dblclick", (event: any) => {
            const { element } = event;
            if (isActivity(element)) {
                this.open(element);
            }
        });
    }

    open(element: ActivityCanvasObject) {
        const position = this.calculatePosition(element);

        const onUpdate = (
            label: string,
            index: number | undefined,
            isMultiple: boolean,
        ) => {
            this.handleUpdate(element, label, index, isMultiple);
            this.currentUpdateCallback = null;
            this.close();
        };

        // Store the update callback for outside click handling
        this.currentUpdateCallback = (
            label: string,
            index: number | undefined,
            isMultiple: boolean,
        ) => {
            this.handleUpdate(element, label, index, isMultiple);
        };

        const onCancel = () => {
            this.close();
        };

        const parentElement = document.getElementById("egon-io-container");
        if (parentElement) {
            // Remove any existing popup first
            this.close();

            const tempContainer = document.createElement("div");

            const isActivityFromActor =
                !!this.elementRegistryService.getActivityFromActorById(
                    element.businessObject.id,
                );

            render(
                html`<${PopupMenu}
                    x=${position.x}
                    y=${position.y}
                    label=${element.businessObject.name}
                    index=${element.businessObject.number}
                    isMultiple=${element.businessObject.multipleNumberAllowed}
                    displayNumber=${isActivityFromActor}
                    onUpdate=${onUpdate}
                    onCancel=${onCancel}
                />`,
                tempContainer,
            );

            // Get the actual popup element (the first child of temp container)
            this.popupElement = tempContainer.firstElementChild as HTMLElement;

            if (this.popupElement) {
                this.popupElement.setAttribute("data-numbering-popup", "true");
                parentElement.appendChild(this.popupElement);
            }

            // Add click listener to close on an outside click
            setTimeout(() => {
                document.addEventListener(
                    "click",
                    this.handleOutsideClick,
                    true,
                );
            }, 0);
        }
    }

    private close() {
        if (this.popupElement) {
            document.removeEventListener(
                "click",
                this.handleOutsideClick,
                true,
            );
            this.popupElement.remove();
            this.popupElement = null;
            this.currentUpdateCallback = null;
        }
    }

    /**
     * Translates the popup's form values into one `activity.changed` action and
     * nothing else. **The popup must not touch the model**: every mutation it
     * used to make ahead of the command (the number, the allowance, the registry
     * flag) and the cascade it ran after it were invisible to undo and to redo.
     * The handler owns the whole transaction now.
     */
    private handleUpdate = (
        element: ActivityCanvasObject,
        label: string,
        number: number | undefined,
        isMultiple: boolean,
    ) => {
        this.commandStack.execute("activity.changed", {
            businessObject: element.businessObject,
            element,
            newLabel: label,
            // `PopupMenu` reports an empty number field as 0; "no number" has to
            // reach the handler as undefined, not as a number to cascade from.
            newNumber: number || undefined,
            newMultipleNumberAllowed: isMultiple,
        });
    };

    private handleOutsideClick = (event: MouseEvent) => {
        if (!this.popupElement) return;

        // Check if the click target is inside the popup or any of its children
        const target = event.target as HTMLElement;
        const clickedInsidePopup = target.closest(
            '[data-numbering-popup="true"]',
        );

        if (!clickedInsidePopup && this.currentUpdateCallback) {
            // Get current values from the popup inputs
            const labelInput = this.popupElement.querySelector(
                'input[name="label"]',
            ) as HTMLInputElement;
            const indexInput = this.popupElement.querySelector(
                'input[name="index"]',
            ) as HTMLInputElement;
            const multipleInput = this.popupElement.querySelector(
                'input[name="multiple"]',
            ) as HTMLInputElement;

            const label = labelInput?.value || "";
            const index = indexInput ? Number(indexInput.value) : undefined;
            const isMultiple = multipleInput?.checked || false;

            // Trigger the update before closing
            this.currentUpdateCallback(label, index, isMultiple);
            this.currentUpdateCallback = null;
            this.close();
        }
    };

    private calculatePosition(element: ActivityCanvasObject) {
        const point1 = element["waypoints"][0];
        const point2: any =
            element["waypoints"][element["waypoints"].length - 1];
        const canvasX = (point1.x + point2.x) / 2;
        const canvasY = (point1.y + point2.y) / 2;

        const viewbox = this.canvas.viewbox();
        return {
            x: (canvasX - viewbox.x) * viewbox.scale,
            y: (canvasY - viewbox.y) * viewbox.scale,
        };
    }
}
