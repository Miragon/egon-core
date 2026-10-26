import { afterEach, describe, expect, it, vi } from "vitest";
import { Injector } from "didi";
import IdFactoryModule from "../id-factory";
import IconSetModule from "../../../iconSet/service";
import { DomainStoryIdFactory } from "../id-factory/DomainStoryIdFactory";
import { IconDictionaryService } from "../../../iconSet/service";
import { Dictionary } from "../../../story/domain/dictionary";

/**
 * Two injectors must not share mutable state (ADR ARC-5): the id factory's ids
 * and the custom-icon pool.
 *
 * Unit tier, stopping at the injector: no diagram-js primitives are needed. Live
 * stylesheet behaviour is in `IconCssIsolation.browser.spec.ts`.
 */
function makeInjector(
    styleElement?: HTMLStyleElement,
    scopeId = "test-scope",
): Injector {
    return new Injector([
        IdFactoryModule,
        IconSetModule,
        // didi throws `No provider for "config"!` without a `config` provider.
        {
            config: [
                "value",
                { domainStoryIconStyleSheet: { styleElement, scopeId } },
            ],
        },
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

describe("multi-instance isolation", () => {
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
        expect(a.get("domainStoryIconSanitizer")).not.toBe(
            b.get("domainStoryIconSanitizer"),
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
        const styleA = createAttachedStyleElement();
        const styleB = createAttachedStyleElement();
        const a = makeInjector(styleA, "scope-a");
        const b = makeInjector(styleB, "scope-b");

        addIcon(a, "only-in-a");
        addIcon(b, "only-in-b");

        expect(selectorsOf(styleA)).toEqual([
            '[data-egon-icon-scope="scope-a"] .icon-domain-story-only-in-a::before',
        ]);
        expect(selectorsOf(styleB)).toEqual([
            '[data-egon-icon-scope="scope-b"] .icon-domain-story-only-in-b::before',
        ]);
    });

    it("leaves no residue after an injector is discarded", () => {
        // Module-level state would outlive A's injector and poison B.
        vi.spyOn(Math, "random").mockReturnValue(0.0001);
        mutateAll(makeInjector());

        expectPristine(makeInjector());
    });
});
