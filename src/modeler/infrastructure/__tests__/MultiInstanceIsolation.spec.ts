import { afterEach, describe, expect, it, vi } from "vitest";
import { Injector } from "didi";
import IdFactoryModule from "../id-factory";
import IconSetModule from "../../../iconSet/service";
import { DomainStoryIdFactory } from "../id-factory/DomainStoryIdFactory";
import { IconDictionaryService } from "../../../iconSet/service";
import { Dictionary } from "../../../story/domain/dictionary";

/**
 * The headline regression for issue #12: two EgonClient instances on one page
 * must not share mutable state. This resolves the previously module-global
 * offenders — the id factory's id list and the icon dictionary's custom-icon
 * pool — through two independent didi injectors and proves that mutating one
 * leaves the other pristine. (A third offender, the activity-number stash, was
 * covered here until #74 deleted the mechanism outright: the renderer that read
 * it back no longer writes to the model at all.)
 *
 * It stops at the injector layer on purpose. A full two-`EgonClient`
 * boot/render test is infeasible under jsdom: rendering calls `getBBox`, which
 * jsdom's SVG has no layout engine for (see the "jsdom has no SVG canvas" note
 * in DiagramJsModelerAdapter.spec.ts, and EgonClient.spec.ts, which mocks the
 * ports rather than booting diagram-js). Once each offender is injector-owned,
 * non-leakage is structural — rule H in architecture.spec.ts locks it in — so
 * the injector-level proof is sufficient. Neither module needs diagram-js
 * primitives, so a bare injector over them plus a `config` value resolves every
 * service.
 */
function makeInjector(styleElement?: HTMLStyleElement): Injector {
    return new Injector([
        IdFactoryModule,
        IconSetModule,
        // IconCssInjector injects `config.domainStoryIconStyleSheet`; didi
        // throws `No provider for "config"!` when the whole `config` provider
        // is missing (a missing *key* on a present config is fine), so a bare
        // injector must supply one.
        { config: ["value", { domainStoryIconStyleSheet: { styleElement } }] },
    ]);
}

/** Mutates every offending service in an injector, then discards its reference. */
function mutateAll(injector: Injector): void {
    injector
        .get<DomainStoryIdFactory>("domainStoryIdFactory")
        .registerId("actor_0001");
    injector
        .get<IconDictionaryService>("domainStoryIconDictionaryService")
        .addIMGToIconDictionary("<svg/>", "onlyInA");
}

/**
 * A `<style>` node inside an attached container — `sheet` is `null` while the
 * node sits outside a document, which would silence every insert.
 */
function createAttachedStyleElement(): HTMLStyleElement {
    const container = document.createElement("div");
    container.setAttribute("data-isolation-fixture", "");
    document.body.appendChild(container);

    const style = document.createElement("style");
    container.appendChild(style);
    return style;
}

/** Publishes one custom icon's CSS rule through an injector's icon service. */
function addIcon(injector: Injector, name: string): void {
    const icons = new Dictionary<string>();
    icons.set(name, "<svg/>");
    injector
        .get<IconDictionaryService>("domainStoryIconDictionaryService")
        .addIconsToCss(icons);
}

function selectorsOf(style: HTMLStyleElement): string[] {
    return Array.from(style.sheet!.cssRules).map(
        (rule) => (rule as CSSStyleRule).selectorText,
    );
}

/** Asserts none of the offending services in an injector carry foreign state. */
function expectPristine(injector: Injector): void {
    // Math.random is mocked by the caller so 0.0001 → the "0001" suffix; a
    // pristine id factory hands out actor_0001, a poisoned one skips to _0002.
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
        document
            .querySelectorAll("[data-isolation-fixture]")
            .forEach((fixture) => fixture.remove());
    });

    it("gives each injector its own service instances", () => {
        const a = makeInjector();
        const b = makeInjector();

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

    it("writes each injector's icon CSS into that injector's own sheet", () => {
        // The stylesheet half of the same charter: before #69 both injectors
        // resolved one document-global `<style id="iconsCss">`, so B's icon
        // rules landed in A's sheet.
        const styleA = createAttachedStyleElement();
        const styleB = createAttachedStyleElement();
        const a = makeInjector(styleA);
        const b = makeInjector(styleB);

        addIcon(a, "only-in-a");
        addIcon(b, "only-in-b");

        expect(selectorsOf(styleA)).toEqual([
            ".icon-domain-story-only-in-a::before",
        ]);
        expect(selectorsOf(styleB)).toEqual([
            ".icon-domain-story-only-in-b::before",
        ]);
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
