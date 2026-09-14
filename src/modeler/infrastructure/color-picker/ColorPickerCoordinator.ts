import type CommandStack from "diagram-js/lib/command/CommandStack";
import type ElementRegistry from "diagram-js/lib/core/ElementRegistry";
import type EventBus from "diagram-js/lib/core/EventBus";
import type Selection from "diagram-js/lib/features/selection/Selection";
import type { Element } from "diagram-js/lib/model/Types";
import Ids from "ids";

import {
    hexToRGBA,
    isHexWithAlpha,
    rgbaToHex,
} from "../../../shared/domain/colorConverter";
import { colorIncludesIncomingConnection } from "../../../story/domain/color";
import { reportPostCommitError } from "../../../shared/infrastructure/reportError";
import { ColorPickerPreviewState } from "./ColorPickerPreviewState";

interface ActiveColorPickerRequest {
    readonly id: string;
    readonly elements: readonly Element[];
    readonly elementIds: readonly string[];
}

/** Owns the color-picker request active in one diagram-js editor session. */
export class ColorPickerCoordinator {
    static $inject: string[] = [
        "eventBus",
        "elementRegistry",
        "selection",
        "commandStack",
        "domainStoryColorPickerPreviewState",
    ];

    private readonly ids = new Ids();
    private active?: ActiveColorPickerRequest;
    private destroyed = false;

    constructor(
        private readonly eventBus: EventBus,
        private readonly elementRegistry: ElementRegistry,
        private readonly selection: Selection,
        private readonly commandStack: CommandStack,
        private readonly previewState: ColorPickerPreviewState,
    ) {
        eventBus.on("selection.changed", () => this.cancelActive());
        eventBus.on("contextPad.close", () => this.cancelActive());
        eventBus.on(["commandStack.execute", "commandStack.revert"], () =>
            this.cancelActive(),
        );
        eventBus.on(["shape.remove", "connection.remove"], () =>
            this.cancelActive(),
        );
        eventBus.on("diagram.destroy", () => {
            this.destroyed = true;
            this.active = undefined;
            this.previewState.clear();
        });
    }

    request(target: Element | Element[]): boolean {
        if (this.destroyed) return false;

        const elements = (Array.isArray(target) ? target : [target]).slice();
        const elementIds = elements.map(({ id }) => id);
        if (!elements.length || !this.isValidSnapshot({ elements, elementIds }))
            return false;

        this.cancelActive();
        const request: ActiveColorPickerRequest = {
            id: this.ids.next(),
            elements,
            elementIds,
        };
        this.active = request;

        let color = "#000000";
        if (elements.length === 1) {
            color = elements[0].businessObject.pickedColor ?? color;
            if (isHexWithAlpha(color)) color = hexToRGBA(color);
        }

        this.eventBus.fire("dst.colorPicker.requested", {
            requestId: request.id,
            elementIds: [...request.elementIds],
            color,
        });
        return true;
    }

    preview(requestId: string, color: string): boolean {
        const request = this.accept(requestId);
        if (!request) return false;

        const entries: [Element, string][] = [];
        request.elements.forEach((element) => {
            const previewColor = this.convertForElement(element, color);
            entries.push([element, previewColor]);
            if (colorIncludesIncomingConnection(element.businessObject.type)) {
                const connector = element.incoming?.[0];
                if (connector) entries.push([connector, previewColor]);
            }
        });
        this.repaint(this.previewState.replace(entries));
        return true;
    }

    confirm(requestId: string, color: string): boolean {
        const request = this.accept(requestId);
        if (!request) return false;

        // Retire before executing: command-stack lifecycle events invalidate
        // open pickers, but these commands are the completion of this request.
        this.active = undefined;

        try {
            this.repaint(this.previewState.clear());
            request.elements.forEach((element) => {
                this.commandStack.execute("element.colorChange", {
                    businessObject: element.businessObject,
                    newColor: this.convertForElement(element, color),
                    element,
                });
            });
        } finally {
            this.notifyClosed(request.id);
        }
        return true;
    }

    cancel(requestId: string): boolean {
        if (this.destroyed || this.active?.id !== requestId) return false;
        this.finishCancellation(this.active);
        return true;
    }

    cancelActive(): void {
        if (!this.active) return;
        this.finishCancellation(this.active);
    }

    private accept(requestId: string): ActiveColorPickerRequest | undefined {
        if (this.destroyed || this.active?.id !== requestId) return undefined;
        if (!this.isValidSnapshot(this.active)) {
            this.finishCancellation(this.active);
            return undefined;
        }
        return this.active;
    }

    private isValidSnapshot(
        request: Pick<ActiveColorPickerRequest, "elements" | "elementIds">,
    ): boolean {
        const selected = this.selection.get();
        return (
            selected.length === request.elements.length &&
            request.elements.every(
                (element, index) =>
                    element.id === request.elementIds[index] &&
                    this.elementRegistry.get(request.elementIds[index]) ===
                        element &&
                    selected.includes(element),
            )
        );
    }

    private convertForElement(element: Element, color: string): string {
        return isHexWithAlpha(element.businessObject.pickedColor)
            ? rgbaToHex(color)
            : color;
    }

    private finishCancellation(request: ActiveColorPickerRequest): void {
        if (this.active !== request) return;
        this.active = undefined;
        this.repaint(this.previewState.clear());
        this.notifyClosed(request.id);
    }

    private repaint(elements: readonly Element[]): void {
        elements.forEach((element) => {
            try {
                this.eventBus.fire("element.changed", { element });
            } catch (error) {
                reportPostCommitError(error);
            }
        });
    }

    private notifyClosed(requestId: string): void {
        if (!this.destroyed) {
            this.eventBus.fire("dst.colorPicker.closed", { requestId });
        }
    }
}
