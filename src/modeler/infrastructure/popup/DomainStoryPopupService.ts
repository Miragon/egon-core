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

    private popupMount: HTMLElement | null = null;
    private popupElement: HTMLElement | null = null;
    private outsideClickRegistrationTimer: ReturnType<
        typeof setTimeout
    > | null = null;
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
        this.eventBus.on("diagram.destroy", this.destroy);
    }

    open(element: ActivityCanvasObject) {
        // Closing first is important: close clears the callback belonging to the
        // old popup, so assigning the new one before this would make reopening
        // lose its outside-click update.
        this.close();

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

        const mount = document.createElement("div");
        mount.setAttribute("data-numbering-popup-mount", "true");
        this.canvas.getContainer().appendChild(mount);
        this.popupMount = mount;

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
            mount,
        );

        this.popupElement = mount.firstElementChild as HTMLElement | null;
        this.popupElement?.setAttribute("data-numbering-popup", "true");

        // Defer registration so the double-click that opened the popup cannot
        // immediately submit it as an outside click.
        this.outsideClickRegistrationTimer = setTimeout(() => {
            this.outsideClickRegistrationTimer = null;
            document.addEventListener("click", this.handleOutsideClick, true);
        }, 0);
    }

    private close() {
        if (this.outsideClickRegistrationTimer !== null) {
            clearTimeout(this.outsideClickRegistrationTimer);
            this.outsideClickRegistrationTimer = null;
        }

        document.removeEventListener("click", this.handleOutsideClick, true);

        if (this.popupMount) {
            render(null, this.popupMount);
            this.popupMount.remove();
        }

        this.popupMount = null;
        this.popupElement = null;
        this.currentUpdateCallback = null;
    }

    private destroy = () => {
        this.close();
    };

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

        // Check against this instance's popup. A click in another modeler's
        // popup is outside this one and must submit this popup as usual.
        const target = event.target;
        const clickedInsidePopup =
            target instanceof Node && this.popupElement.contains(target);

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
