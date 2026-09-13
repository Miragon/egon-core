import type Diagram from "diagram-js";
import type Canvas from "diagram-js/lib/core/Canvas";
import type EventBus from "diagram-js/lib/core/EventBus";
import type ElementRegistry from "diagram-js/lib/core/ElementRegistry";
import type { ElementLike } from "diagram-js/lib/model/Types";

import type { ElementRegistryService } from "../../service";
import {
    createReplayStory,
    type ReplayStartOptions,
    type ReplayState,
    type ReplayStory,
} from "../../../story/domain/replay";
import { ColorPickerCoordinator } from "../color-picker/ColorPickerCoordinator";

const HIDDEN_MARKER = "egon-replay-hidden";
const CURRENT_MARKER = "egon-replay-current";

/** Instance-scoped replay state and diagram-js presentation translation. */
export class ReplayController {
    private story: ReplayStory = { steps: [], groupElementIds: [] };
    private active = false;
    private stepIndex: number | null = null;
    private hasGroups = false;
    private showGroups = false;
    private destroyed = false;
    private commandListening = false;
    private readonly eventBus: EventBus;
    private readonly canvas: Canvas;
    private readonly registry: ElementRegistry;
    private readonly commandChanged = () => {
        if (this.active) this.stop();
    };

    constructor(
        private readonly diagram: Diagram,
        private readonly changed: (state: ReplayState) => void,
        initialShowGroups = false,
    ) {
        this.showGroups = initialShowGroups;
        this.eventBus = diagram.get<EventBus>("eventBus");
        this.canvas = diagram.get<Canvas>("canvas");
        this.registry = diagram.get<ElementRegistry>("elementRegistry");
    }

    getState(): ReplayState {
        return {
            active: this.active,
            stepIndex: this.active ? this.stepIndex : null,
            stepCount: this.story.steps.length,
            activityNumber:
                this.active && this.stepIndex !== null
                    ? (this.story.steps[this.stepIndex]?.activityNumber ?? null)
                    : null,
            hasGroups: this.hasGroups,
            showGroups: this.showGroups,
        };
    }

    start(options: ReplayStartOptions = {}): ReplayState {
        const previous = this.getState();
        if (options.showGroups !== undefined) {
            this.showGroups = options.showGroups;
        }

        const elements = this.diagram
            .get<ElementRegistryService>("domainStoryElementRegistryService")
            .getAllCanvasObjects();
        const groups = this.diagram
            .get<ElementRegistryService>("domainStoryElementRegistryService")
            .getAllGroups();
        this.story = createReplayStory(elements, groups);
        this.hasGroups = this.story.groupElementIds.length > 0;
        this.closeTransientUi();

        this.active = this.story.steps.length > 0;
        this.stepIndex = this.active ? 0 : null;
        if (this.active) {
            this.listenForCommands();
            this.present();
        } else {
            this.stopListeningForCommands();
            this.clearPresentation();
        }
        return this.publishIfChanged(previous);
    }

    stop(): ReplayState {
        const previous = this.getState();
        const wasActive = this.active;
        this.active = false;
        this.stepIndex = null;
        this.story = { steps: [], groupElementIds: [] };
        this.stopListeningForCommands();
        if (wasActive) this.clearPresentation();
        return this.publishIfChanged(previous);
    }

    next(): ReplayState {
        return this.seek((this.stepIndex ?? 0) + 1);
    }

    previous(): ReplayState {
        return this.seek((this.stepIndex ?? 0) - 1);
    }

    seek(index: number): ReplayState {
        if (!Number.isFinite(index)) {
            throw new RangeError("Replay step index must be finite");
        }
        const previous = this.getState();
        if (this.active && this.story.steps.length > 0) {
            this.stepIndex = Math.min(
                this.story.steps.length - 1,
                Math.max(0, Math.trunc(index)),
            );
            this.present();
        }
        return this.publishIfChanged(previous);
    }

    setShowGroups(value: boolean): ReplayState {
        const previous = this.getState();
        this.showGroups = value;
        if (this.active) this.present();
        return this.publishIfChanged(previous);
    }

    destroy(): void {
        if (this.destroyed) return;
        this.destroyed = true;
        this.stopListeningForCommands();
        if (this.active) this.clearPresentation();
    }

    private present(): void {
        const step = this.story.steps[this.stepIndex ?? 0];
        const visible = new Set(step.visibleElementIds);
        const highlighted = new Set(step.highlightedElementIds);
        const replayGroups = new Set(this.story.groupElementIds);

        for (const element of this.elements()) {
            if (!element?.id || !element.businessObject) continue;
            const labelTarget = element["labelTarget"] as
                ElementLike | undefined;
            const targetId = labelTarget?.id ?? element.id;
            const group = replayGroups.has(element.id);
            const isVisible = group
                ? this.showGroups && replayGroups.has(element.id)
                : visible.has(targetId);
            this.toggleMarker(element, HIDDEN_MARKER, !isVisible);
            this.toggleMarker(
                element,
                CURRENT_MARKER,
                isVisible && highlighted.has(targetId),
            );
        }
    }

    private clearPresentation(): void {
        for (const element of this.elements()) {
            if (!element?.id || !element.businessObject) continue;
            this.canvas.removeMarker(element as any, HIDDEN_MARKER);
            this.canvas.removeMarker(element as any, CURRENT_MARKER);
        }
    }

    private toggleMarker(
        element: ElementLike,
        marker: string,
        enabled: boolean,
    ) {
        if (enabled) this.canvas.addMarker(element as any, marker);
        else this.canvas.removeMarker(element as any, marker);
    }

    private closeTransientUi(): void {
        const directEditing = this.diagram.get<any>("directEditing", false);
        if (directEditing?.isActive?.()) directEditing.cancel();
        this.diagram.get<any>("contextPad", false)?.close?.();
        this.diagram.get<any>("selection", false)?.select?.([]);
        this.diagram
            .get<ColorPickerCoordinator>(
                "domainStoryColorPickerCoordinator",
                false,
            )
            ?.cancelActive();
    }

    private elements(): ElementLike[] {
        return typeof this.registry.getAll === "function"
            ? this.registry.getAll()
            : [];
    }

    private listenForCommands(): void {
        if (this.commandListening) return;
        this.commandListening = true;
        (this.eventBus.on as any)("commandStack.changed", this.commandChanged);
    }

    private stopListeningForCommands(): void {
        if (!this.commandListening) return;
        this.commandListening = false;
        (this.eventBus.off as any)("commandStack.changed", this.commandChanged);
    }

    private publishIfChanged(previous: ReplayState): ReplayState {
        const current = this.getState();
        if (JSON.stringify(previous) !== JSON.stringify(current)) {
            this.changed(current);
        }
        return current;
    }
}
