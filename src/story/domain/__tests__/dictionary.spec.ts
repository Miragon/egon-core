import { describe, expect, it } from "vitest";
import { Dictionary, Entry } from "../dictionary";

/**
 * `Dictionary<T>` is the uniquely-keyed store behind icon sets and the label
 * dictionary. These cases pin the contract the callers now depend on: writes
 * never overwrite, `get()` throws on a miss (so a missing icon can't render as
 * nothing), `find()` stays lenient, and record conversion drops empty values.
 */
describe("Dictionary", () => {
    it("starts empty", () => {
        const dictionary = new Dictionary<string>();

        expect(dictionary.length).toBe(0);
        expect(dictionary.isEmpty()).toBe(true);
        expect(dictionary.keysArray()).toEqual([]);
    });

    it("stores a value under its key via set()", () => {
        const dictionary = new Dictionary<string>();

        dictionary.set("actor", "<svg/>");

        expect(dictionary.has("actor")).toBe(true);
        expect(dictionary.get("actor")).toBe("<svg/>");
        expect(dictionary.length).toBe(1);
        expect(dictionary.isEmpty()).toBe(false);
    });

    it("does not overwrite an existing key on set()", () => {
        const dictionary = new Dictionary<string>();

        dictionary.set("actor", "<first/>");
        dictionary.set("actor", "<second/>");

        expect(dictionary.get("actor")).toBe("<first/>");
        expect(dictionary.length).toBe(1);
    });

    it("appends an Entry via putEntry() but keeps the first write for a key", () => {
        const dictionary = new Dictionary<string>();

        dictionary.putEntry(new Entry("<first/>", "actor"));
        dictionary.putEntry(new Entry("<second/>", "actor"));

        expect(dictionary.get("actor")).toBe("<first/>");
        expect(dictionary.length).toBe(1);
    });

    it("merges another dictionary via appendDict() without overwriting", () => {
        const target = new Dictionary<string>();
        target.set("actor", "<original/>");
        const source = new Dictionary<string>();
        source.set("actor", "<incoming/>");
        source.set("workObject", "<new/>");

        target.appendDict(source);

        expect(target.keysArray()).toEqual(["actor", "workObject"]);
        expect(target.get("actor")).toBe("<original/>");
        expect(target.get("workObject")).toBe("<new/>");
    });

    it("returns keys in insertion order via keysArray()", () => {
        const dictionary = new Dictionary<string>();

        dictionary.set("a", "1");
        dictionary.set("b", "2");
        dictionary.set("c", "3");

        expect(dictionary.keysArray()).toEqual(["a", "b", "c"]);
    });

    it("removes a single key via delete()", () => {
        const dictionary = new Dictionary<string>();
        dictionary.set("a", "1");
        dictionary.set("b", "2");

        dictionary.delete("a");

        expect(dictionary.has("a")).toBe(false);
        expect(dictionary.keysArray()).toEqual(["b"]);
    });

    it("empties itself via clear()", () => {
        const dictionary = new Dictionary<string>();
        dictionary.set("a", "1");
        dictionary.set("b", "2");

        dictionary.clear();

        expect(dictionary.isEmpty()).toBe(true);
        expect(dictionary.length).toBe(0);
    });

    it("throws on get() for a missing key", () => {
        const dictionary = new Dictionary<string>();

        expect(() => dictionary.get("missing")).toThrow(
            "Key missing not found in dictionary",
        );
    });

    it("returns undefined on find() for a missing key", () => {
        const dictionary = new Dictionary<string>();

        expect(dictionary.find("missing")).toBeUndefined();
    });

    it("returns the value on find() for a present key", () => {
        const dictionary = new Dictionary<string>();
        dictionary.set("actor", "<svg/>");

        expect(dictionary.find("actor")).toBe("<svg/>");
    });

    it("round-trips through toRecord()/fromRecord()", () => {
        const dictionary = new Dictionary<string>();
        dictionary.set("actor", "<a/>");
        dictionary.set("workObject", "<w/>");

        const record = dictionary.toRecord();
        expect(record).toEqual({ actor: "<a/>", workObject: "<w/>" });

        const restored = Dictionary.fromRecord(record);
        expect(restored.keysArray()).toEqual(["actor", "workObject"]);
        expect(restored.get("actor")).toBe("<a/>");
        expect(restored.get("workObject")).toBe("<w/>");
    });

    it("skips null/undefined values in fromRecord()", () => {
        const record: Record<string, string | null | undefined> = {
            actor: "<svg/>",
            missingIcon: null,
            undefinedIcon: undefined,
        };

        const dictionary = Dictionary.fromRecord(record);

        expect(dictionary.keysArray()).toEqual(["actor"]);
        expect(dictionary.has("missingIcon")).toBe(false);
        expect(dictionary.has("undefinedIcon")).toBe(false);
    });
});
