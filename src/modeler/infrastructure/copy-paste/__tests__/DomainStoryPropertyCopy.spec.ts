import { beforeEach, describe, expect, it } from "vitest";
import EventBus from "diagram-js/lib/core/EventBus";

import { DomainStoryPropertyCopy } from "../DomainStoryPropertyCopy";
import { ElementTypes } from "../../../../story/domain/elementTypes";

/**
 * Pins the property-copy contract that every paste depends on. Two things here
 * are easy to break silently and neither had cover:
 *
 * - `incoming`/`outgoing` must never be copied. They hold live diagram-js
 *   element references; carrying them onto a pasted business object would wire
 *   the copy back into the original's connections. Note this is a two-entry
 *   *blacklist* (`DISALLOWED_PROPERTIES`), not a whitelist — everything else is
 *   copied, so a new business-object field needs no registration here.
 * - `extensionElements` must sort last, because the extension copy may read
 *   properties written by the earlier ones.
 *
 * Writing these turned up a port regression: the default `canCopyProperty`
 * listener answered `true` for an allowed property where upstream answers
 * nothing, so `copyProperty` handed that `true` back as the value and every
 * copied property became the boolean `true`. Fixed alongside; "copies ordinary
 * properties onto the target" and "passes a primitive straight through" are the
 * regression locks.
 *
 * Drives a real diagram-js `EventBus` with no canvas — the service only ever
 * talks to the bus (precedent: `DomainStoryPasteRestore.spec.ts`).
 */

const ACTOR_TYPE = ElementTypes.ACTOR + "Person";

/** Above diagram-js' default listener priority (1000). */
const HIGH_PRIORITY = 2000;

describe("DomainStoryPropertyCopy", () => {
    let eventBus: EventBus;
    let propertyCopy: DomainStoryPropertyCopy;

    beforeEach(() => {
        eventBus = new EventBus();
        propertyCopy = new DomainStoryPropertyCopy(eventBus);
    });

    describe("copyElement", () => {
        it("copies ordinary properties onto the target", () => {
            const source = {
                type: ACTOR_TYPE,
                name: "Alice",
                number: 3,
                pickedColor: "#ff0000",
            };

            const target = propertyCopy.copyElement(source, {}, [
                "type",
                "name",
                "number",
                "pickedColor",
            ]);

            expect(target).toEqual({
                type: ACTOR_TYPE,
                name: "Alice",
                number: 3,
                pickedColor: "#ff0000",
            });
        });

        it("never copies incoming/outgoing", () => {
            const source = {
                name: "Alice",
                incoming: [{ id: "activity_0001" }],
                outgoing: [{ id: "activity_0002" }],
            };

            const target = propertyCopy.copyElement(source, {}, [
                "name",
                "incoming",
                "outgoing",
            ]);

            expect(target).toEqual({ name: "Alice" });
        });

        it("does not choke on a property the source does not have", () => {
            const target = propertyCopy.copyElement({ name: "Alice" }, {}, [
                "name",
                "pickedColor",
            ]);

            expect(target).toEqual({ name: "Alice" });
        });

        it("accepts a single property name instead of an array", () => {
            const target = propertyCopy.copyElement(
                { name: "Alice", number: 3 },
                {},
                "name" as unknown as string[],
            );

            expect(target).toEqual({ name: "Alice" });
        });

        it("copies extensionElements last", () => {
            const copied: string[] = [];
            // Observe the visit order from inside the copy loop; the bus fires
            // `canCopyProperty` once per property, in the order the sort left.
            eventBus.on("propertyCopy.canCopyProperty", (context: any) => {
                copied.push(context.propertyName);
            });

            propertyCopy.copyElement(
                { extensionElements: {}, name: "Alice", number: 3 },
                {},
                ["extensionElements", "name", "number"],
            );

            expect(copied).toEqual(["name", "number", "extensionElements"]);
        });

        it("leaves an empty property list alone", () => {
            // `canCopyProperties` bails out with `undefined` for an empty list,
            // so the default (unsorted, empty) names survive and nothing copies.
            const target = propertyCopy.copyElement({ name: "Alice" }, {}, []);

            expect(target).toEqual({});
        });

        it("suppresses an assignment a listener vetoes", () => {
            eventBus.on(
                "propertyCopy.canSetCopiedProperty",
                (context: any) => context.propertyName !== "number",
            );

            const target = propertyCopy.copyElement(
                { name: "Alice", number: 3 },
                {},
                ["name", "number"],
            );

            expect(target).toEqual({ name: "Alice" });
        });

        it("copies nothing when a listener vetoes the whole element", () => {
            // Above the service's own sorter (default 1000): the bus answers
            // with the first non-undefined return, so a same-priority listener
            // registered later would never be consulted.
            eventBus.on(
                "propertyCopy.canCopyProperties",
                HIGH_PRIORITY,
                () => false,
            );

            const target = propertyCopy.copyElement({ name: "Alice" }, {}, [
                "name",
            ]);

            expect(target).toEqual({});
        });

        it("honours a property list a listener substitutes", () => {
            eventBus.on("propertyCopy.canCopyProperties", HIGH_PRIORITY, () => [
                "number",
            ]);

            const target = propertyCopy.copyElement(
                { name: "Alice", number: 3 },
                {},
                ["name"],
            );

            expect(target).toEqual({ number: 3 });
        });
    });

    describe("copyProperty", () => {
        it("stamps $parent on a nested object copy", () => {
            const parent = { id: "actor_0001" };

            const copied = propertyCopy.copyProperty(
                { foo: "bar" },
                parent,
                "extensionElements",
            );

            expect(copied).toEqual({ $parent: parent });
            // `copyElement` on the nested object runs with no property names, so
            // only the `$parent` stamp survives — the nested payload is not
            // walked. Pinned as-is; upstream relies on the stamp, not the copy.
            expect((copied as Record<string, any>)["$parent"]).toBe(parent);
        });

        it("returns undefined for a disallowed property", () => {
            expect(
                propertyCopy.copyProperty([], {}, "incoming"),
            ).toBeUndefined();
        });

        it("passes a primitive straight through", () => {
            expect(propertyCopy.copyProperty("Alice" as any, {}, "name")).toBe(
                "Alice",
            );
        });

        it("hands back what a listener supplies, keeping its own $parent", () => {
            const substitute = { $parent: { id: "elsewhere" } };
            eventBus.on("propertyCopy.canCopyProperty", () => substitute);

            const copied = propertyCopy.copyProperty({}, { id: "here" }, "any");

            expect(copied).toBe(substitute);
            expect((copied as Record<string, any>)["$parent"]).toEqual({
                id: "elsewhere",
            });
        });
    });
});
