import { describe, expect, it } from "vitest";
import { DomainStoryNumberStash } from "../DomainStoryNumberStash";

/**
 * Pins the stash's read-once semantics (a stashed number is applied at most once
 * per opt-in) and the issue-#12 guarantee that two stashes are independent — the
 * hand-off state now lives on the instance, not at module scope.
 */
describe("DomainStoryNumberStash", () => {
    it("stashes a number but leaves it unused until opted in", () => {
        const stash = new DomainStoryNumberStash();

        stash.stashNumber(7);

        // stashNumber resets `use`, so the reader must not apply the number.
        expect(stash.getNumberStash()).toEqual({ use: false, number: 7 });
    });

    it("applies an opted-in number exactly once", () => {
        const stash = new DomainStoryNumberStash();

        stash.stashNumber(7);
        stash.toggleStashUse(true);

        // First read consumes `use`; the second sees it already reset.
        expect(stash.getNumberStash()).toEqual({ use: true, number: 7 });
        expect(stash.getNumberStash()).toEqual({ use: false, number: 7 });
    });

    it("keeps two stashes isolated", () => {
        const stashA = new DomainStoryNumberStash();
        const stashB = new DomainStoryNumberStash();

        stashA.stashNumber(3);
        stashA.toggleStashUse(true);

        // B never saw A's number or its opt-in.
        expect(stashB.getNumberStash()).toEqual({ use: false, number: 0 });
        expect(stashA.getNumberStash()).toEqual({ use: true, number: 3 });
    });
});
