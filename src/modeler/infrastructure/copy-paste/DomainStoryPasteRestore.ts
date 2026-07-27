import EventBus from "diagram-js/lib/core/EventBus";
import { isAnnotation } from "../../../story/domain/elementPredicates";

// Run before DomainStoryCopyPaste (default priority 1000) deletes the
// descriptor's `oldBusinessObject` — that is where the copied color and text
// still live, so we must stash them first.
const HIGH_PRIORITY = 10000;

// Run after diagram-js `Create` (default priority) has actually created the
// elements. Create's own `create.end` handler returns `false` on a rejected
// placement, which stops propagation and skips this listener automatically —
// so a cancelled paste never re-applies stale values.
const LOW_PRIORITY = 250;

/**
 * Restores per-element visual state that diagram-js copy-paste drops on paste.
 *
 * WHY: `pickedColor` and a text annotation's `text` live on the businessObject,
 * not on properties diagram-js knows how to carry across a copy-paste. Without
 * this, a pasted colored element renders black (the renderer falls back to
 * `DEFAULT_COLOR` when `pickedColor` is unset) and a pasted text annotation
 * loses its text. Issue #9 ports this behavior — previously host-side Angular
 * code in WPS/egon.io (commit 62f5835d) — into the plugin so every host inherits
 * it for free.
 *
 * **Not** the height, since #74. Upstream stashes it, and so did this class, but
 * diagram-js already copies `x/y/width/height` onto the paste descriptor and
 * `DomainStoryElementFactory` honours a supplied height — so the copy arrives
 * correctly sized on its own. The stash was only ever needed because it was
 * reading `businessObject.height`/`number`, neither of which a live canvas
 * maintains. Verified by disabling the restore against
 * `CopyPasteIntegration.browser.spec.ts`, whose "grew into after it was created"
 * case pastes an annotation whose height came from a `shape.resize` rather than
 * its create attrs — the case a factory default could not cover.
 *
 * HOW: `copyPaste.pasteElement` fires once per pasted descriptor while the
 * copied `oldBusinessObject` is still attached; we stash its values there
 * (hence HIGH_PRIORITY). The actual elements only exist once the user clicks to
 * place them, which fires `create.end`; we re-apply the stash and repaint there
 * (hence LOW_PRIORITY). Instance fields only — no module-level state — so
 * multiple modeler instances stay isolated (#12).
 *
 * Known limitation (matches upstream): a direct paste via
 * `copyPaste.paste({ element, point })` bypasses the create interaction and so
 * never fires `create.end`, leaving the stash unapplied. No caller uses that
 * path today.
 */
export class DomainStoryPasteRestore {
    static $inject: string[] = ["eventBus"];

    // One entry per pasted element, indexed by paste order (matches the index
    // diagram-js hands back on `create.end`).
    private pasteColor: (string | undefined)[] = [];
    // One entry per pasted text annotation, consumed in FIFO order via shift().
    private pasteText: string[] = [];

    constructor(private readonly eventBus: EventBus) {
        // Deviation from upstream: reset the stash when a paste starts. Upstream
        // only cleared it on `create.end`, so a paste cancelled with Escape left
        // stale values behind and corrupted the next paste. Firing on
        // `copyPaste.pasteElements` (before the per-element events) clears that
        // leak; DomainStoryCopyPaste already resets its own state here too.
        eventBus.on("copyPaste.pasteElements", () => this.resetStashes());

        eventBus.on("copyPaste.pasteElement", HIGH_PRIORITY, (event: any) =>
            this.pasteElement(event),
        );

        eventBus.on("create.end", LOW_PRIORITY, (event: any) =>
            this.createEnd(event),
        );
    }

    /**
     * Stashes the copied businessObject's visual state before
     * DomainStoryCopyPaste strips `oldBusinessObject` from the descriptor.
     */
    private pasteElement(event: any) {
        const descriptor = event.descriptor;
        const oldBusinessObject = descriptor.oldBusinessObject;

        this.pasteColor.push(oldBusinessObject.pickedColor);

        if (isAnnotation(descriptor)) {
            // `text ?? ""` mirrors the renderer, which treats a missing
            // annotation text as empty rather than undefined.
            this.pasteText.push(oldBusinessObject.text ?? "");
        }
    }

    /**
     * Re-applies the stashed state to the freshly created elements and repaints
     * them, then clears the stash for the next paste.
     */
    private createEnd(event: any) {
        // Deviation from upstream: upstream guarded with `if (!this.pasteColor)`,
        // which is always truthy for an array and so never returned — meaning
        // every ordinary palette-create (no preceding paste) wrote
        // `pickedColor = undefined` and fired a spurious `element.changed`.
        // Guard on length instead so palette-creates are left untouched.
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
