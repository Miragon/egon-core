import EventBus from "diagram-js/lib/core/EventBus";
import { isAnnotation } from "../../../story/domain/elementPredicates";

// Runs before DomainStoryCopyPaste (priority 1000) deletes `oldBusinessObject`,
// which still holds the copied color and text.
const HIGH_PRIORITY = 10000;

// Runs after diagram-js `Create` has created the elements. A rejected drop stops
// propagation before this listener; `create.rejected` cleans up instead.
const LOW_PRIORITY = 250;

/**
 * diagram-js CopyPaste marks its create context with
 * `hints.createElementsBehavior = false`. Starting a paste also cancels any
 * unrelated create drag, and resetting on that would discard the fresh stash.
 */
function isPasteInteraction(event: any): boolean {
    return event.context?.hints?.createElementsBehavior === false;
}

/**
 * Restores `pickedColor` and annotation `text`, which live on the business
 * object where diagram-js copy-paste does not carry them. Stashed on
 * `copyPaste.pasteElement`, re-applied on `create.end` once the elements exist.
 * Height needs no stash: diagram-js copies it onto the descriptor and the
 * element factory honours it.
 *
 * Known limitation (as upstream): `copyPaste.paste({ element, point })` skips
 * the create interaction, so the stash is never applied.
 */
export class DomainStoryPasteRestore {
    static $inject: string[] = ["eventBus"];

    // Indexed by paste order, which matches the index of `create.end`'s elements.
    private pasteColor: (string | undefined)[] = [];
    private pasteText: string[] = [];

    constructor(private readonly eventBus: EventBus) {
        // Deviation from upstream, which only cleared on `create.end`: an
        // Escape-cancelled paste would leak its stash into the next one.
        eventBus.on("copyPaste.pasteElements", () => this.resetStashes());

        eventBus.on("copyPaste.pasteElement", HIGH_PRIORITY, (event: any) =>
            this.pasteElement(event),
        );

        eventBus.on("create.end", LOW_PRIORITY, (event: any) =>
            this.createEnd(event),
        );

        // A leftover stash would be applied to the next plain palette create.
        // Escape fires `create.cancel`; a rejected drop fires `create.rejected`.
        eventBus.on(["create.cancel", "create.rejected"], (event: any) => {
            if (isPasteInteraction(event)) {
                this.resetStashes();
            }
        });
    }

    private pasteElement(event: any) {
        const descriptor = event.descriptor;
        const oldBusinessObject = descriptor.oldBusinessObject;

        this.pasteColor.push(oldBusinessObject.pickedColor);

        if (isAnnotation(descriptor)) {
            // Mirrors the renderer, which treats a missing text as empty.
            this.pasteText.push(oldBusinessObject.text ?? "");
        }
    }

    private createEnd(event: any) {
        // Deviation from upstream, whose `!this.pasteColor` is never true for an
        // array, so plain palette-creates got `pickedColor = undefined`.
        if (!this.pasteColor.length) return;

        for (const elementsKey in event.elements) {
            const element = event.elements[elementsKey];

            if (isAnnotation(element)) {
                element.businessObject.text = this.pasteText[0];
                this.pasteText.shift();
            }

            element.businessObject.pickedColor =
                this.pasteColor[parseInt(elementsKey)];

            this.eventBus.fire("element.changed", { element });
        }

        this.resetStashes();
    }

    private resetStashes() {
        this.pasteColor = [];
        this.pasteText = [];
    }
}
