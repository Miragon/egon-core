import { afterEach, describe, expect, it, vi } from "vitest";
import { Injector } from "didi";
import NumberStashModule from "../number-stash";
import IdFactoryModule from "../id-factory";
import IconSetModule from "../../../iconSet/service";
import { DomainStoryNumberStash } from "../number-stash/DomainStoryNumberStash";
import { DomainStoryIdFactory } from "../id-factory/DomainStoryIdFactory";
import { IconDictionaryService } from "../../../iconSet/service";

/**
 * The headline regression for issue #12: two EgonClient instances on one page
 * must not share mutable state. This resolves the previously module-global
 * offenders — the number stash, the id factory's id list, and the icon
 * dictionary's custom-icon pool — through two independent didi injectors and
 * proves that mutating one leaves the other pristine.
 *
 * It stops at the injector layer on purpose. A full two-`EgonClient`
 * boot/render test is infeasible under jsdom: rendering calls `getBBox`, which
 * jsdom's SVG has no layout engine for (see the "jsdom has no SVG canvas" note
 * in DiagramJsModelerAdapter.spec.ts, and EgonClient.spec.ts, which mocks the
 * ports rather than booting diagram-js). Once each offender is injector-owned,
 * non-leakage is structural — rule H in architecture.spec.ts locks it in — so
 * the injector-level proof is sufficient. These three modules need no diagram-js
 * primitives, so a bare injector over them resolves every service.
 */
function makeInjector(): Injector {
    return new Injector([NumberStashModule, IdFactoryModule, IconSetModule]);
}

/** Mutates every offending service in an injector, then discards its reference. */
function mutateAll(injector: Injector): void {
    const stash = injector.get<DomainStoryNumberStash>(
        "domainStoryNumberStash",
    );
    stash.stashNumber(9);
    stash.toggleStashUse(true);
    injector
        .get<DomainStoryIdFactory>("domainStoryIdFactory")
        .registerId("actor_0001");
    injector
        .get<IconDictionaryService>("domainStoryIconDictionaryService")
        .addIMGToIconDictionary("<svg/>", "onlyInA");
}

/** Asserts none of the offending services in an injector carry foreign state. */
function expectPristine(injector: Injector): void {
    // Math.random is mocked by the caller so 0.0001 → the "0001" suffix; a
    // pristine id factory hands out actor_0001, a poisoned one skips to _0002.
    expect(
        injector
            .get<DomainStoryNumberStash>("domainStoryNumberStash")
            .getNumberStash(),
    ).toEqual({ use: false, number: 0 });
    expect(
        injector
            .get<IconDictionaryService>("domainStoryIconDictionaryService")
            .getFullDictionary()
            .has("onlyInA"),
    ).toBe(false);
    expect(
        injector
            .get<DomainStoryIdFactory>("domainStoryIdFactory")
            .getId("actor"),
    ).toBe("actor_0001");
}

describe("multi-instance isolation (issue #12)", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("gives each injector its own service instances", () => {
        const a = makeInjector();
        const b = makeInjector();

        expect(a.get("domainStoryNumberStash")).not.toBe(
            b.get("domainStoryNumberStash"),
        );
        expect(a.get("domainStoryIdFactory")).not.toBe(
            b.get("domainStoryIdFactory"),
        );
        expect(a.get("domainStoryIconDictionaryService")).not.toBe(
            b.get("domainStoryIconDictionaryService"),
        );
    });

    it("keeps mutations in one injector out of another", () => {
        vi.spyOn(Math, "random").mockReturnValue(0.0001);
        const a = makeInjector();
        const b = makeInjector();

        mutateAll(a);

        expectPristine(b);
    });

    it("leaves no residue after an injector is discarded", () => {
        // Mutate and drop A entirely before B is even created. Module-level
        // state would outlive A's injector and poison a later B; injector-owned
        // state leaves nothing behind.
        vi.spyOn(Math, "random").mockReturnValue(0.0001);
        mutateAll(makeInjector());

        expectPristine(makeInjector());
    });
});
