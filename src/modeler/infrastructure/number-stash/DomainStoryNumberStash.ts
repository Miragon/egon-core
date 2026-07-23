/**
 * Carries an activity's number across the redraw that direct-editing triggers.
 *
 * Editing an activity destroys and re-creates its canvas object, so the custom
 * number would be lost. The label-editing provider stashes it on dblclick and
 * the renderer reads it back while drawing the replacement. Holding that hand-off
 * on a didi-instantiated instance (rather than the former module-level `let`s)
 * keeps two EgonClient instances on one page from clobbering each other's stash
 * (issue #12). This is a passive holder — no didi `__init__`, no dependencies.
 */
export class DomainStoryNumberStash {
    private numberStash = 0;
    private stashUse = false;

    /**
     * Stash a number for the next redraw. Resets `use` to false, mirroring the
     * original dblclick writer: the stash is only "used" once a caller opts in
     * via toggleStashUse.
     */
    stashNumber(number: number) {
        this.numberStash = number;
        this.stashUse = false;
    }

    /**
     * Read the stash. Consumes `use` (resets it to false) so a stashed number is
     * applied at most once per stash — the upstream read-once semantics.
     */
    getNumberStash() {
        const number = { use: this.stashUse, number: this.numberStash };
        this.stashUse = false;
        return number;
    }

    /**
     * Opt the stash in or out of being used on the next read. Vestigial even
     * upstream (only ever called with `false`, if at all); kept as a method so
     * WPS/egon.io sync diffs stay reviewable.
     */
    toggleStashUse(use: boolean) {
        this.stashUse = use;
    }
}
