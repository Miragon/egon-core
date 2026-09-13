import { describe, expect, it } from "vitest";

import type { ActivityCanvasObject, CanvasObject } from "../canvasObject";
import { ElementTypes } from "../elementTypes";
import { createReplayStory } from "../replay";

function shape(id: string, type: string): CanvasObject {
    return {
        id,
        type,
        businessObject: { id, type, name: "" },
        outgoing: [],
    } as unknown as CanvasObject;
}

function activity(
    id: string,
    source: CanvasObject,
    target: CanvasObject,
    number?: number,
): ActivityCanvasObject {
    const edge = {
        id,
        type: ElementTypes.ACTIVITY,
        source,
        target,
        outgoing: [],
        businessObject: {
            id,
            type: ElementTypes.ACTIVITY,
            name: "",
            number,
        },
    } as unknown as ActivityCanvasObject;
    source.outgoing = [...(source.outgoing ?? []), edge];
    return edge;
}

describe("createReplayStory", () => {
    it("returns no steps without finite numbered actor-originating activities", () => {
        expect(createReplayStory([], [])).toEqual({
            steps: [],
            groupElementIds: [],
        });

        const actor = shape("actor", ElementTypes.ACTOR + "Person");
        const work = shape("work", ElementTypes.WORKOBJECT + "Document");
        const unnumbered = activity("unnumbered", actor, work);
        const nonFinite = activity("non-finite", actor, work, Infinity);
        const fromWorkObject = activity("from-work", work, actor, 1);

        expect(
            createReplayStory(
                [actor, work, unnumbered, nonFinite, fromWorkObject],
                [],
            ).steps,
        ).toEqual([]);
    });

    it("sorts roots numerically, groups equal numbers, and accumulates", () => {
        const actor = shape("actor", ElementTypes.ACTOR + "Person");
        const workA = shape("work-a", ElementTypes.WORKOBJECT + "Document");
        const workB = shape("work-b", ElementTypes.WORKOBJECT + "Document");
        const firstParallel = activity("first-b", actor, workB, 1);
        const second = activity("second", actor, workA, 9);
        const first = activity("first-a", actor, workA, 1);

        const replay = createReplayStory(
            [actor, workA, workB, second, firstParallel, first],
            [],
        );

        expect(replay.steps.map((step) => step.activityNumber)).toEqual([1, 9]);
        expect(replay.steps[0].highlightedElementIds).toEqual([
            "actor",
            "first-a",
            "work-a",
            "first-b",
            "work-b",
        ]);
        expect(replay.steps[1].visibleElementIds).toEqual(
            expect.arrayContaining(["first-a", "first-b", "second"]),
        );
    });

    it("traces downstream work objects, includes annotations, and terminates cycles", () => {
        const actor = shape("actor", ElementTypes.ACTOR + "Person");
        const work = shape("work", ElementTypes.WORKOBJECT + "Document");
        const note = shape("note", ElementTypes.TEXTANNOTATION);
        const root = activity("root", actor, work, 3);
        const cycle = activity("cycle", work, work);
        const noteLink = {
            id: "note-link",
            type: ElementTypes.CONNECTION,
            target: note,
            businessObject: {},
        } as unknown as ActivityCanvasObject;
        actor.outgoing = [...(actor.outgoing ?? []), noteLink];
        work.outgoing = [...(work.outgoing ?? []), cycle];

        const replay = createReplayStory(
            [actor, work, note, root, cycle, noteLink],
            [],
        );

        expect(replay.steps).toHaveLength(1);
        expect(replay.steps[0].visibleElementIds).toEqual(
            expect.arrayContaining([
                "actor",
                "root",
                "work",
                "cycle",
                "note-link",
                "note",
            ]),
        );
    });

    it("keeps group presentation separate from story steps", () => {
        const actor = shape("actor", ElementTypes.ACTOR + "Person");
        const work = shape("work", ElementTypes.WORKOBJECT + "Document");
        const root = activity("root", actor, work, 1);
        const group = shape("group", ElementTypes.GROUP);

        const replay = createReplayStory([actor, work, root], [group]);

        expect(replay.groupElementIds).toEqual(["group"]);
        expect(replay.steps[0].visibleElementIds).not.toContain("group");
    });

    it("stops at an actor until that actor's own numbered step", () => {
        const firstActor = shape("first-actor", ElementTypes.ACTOR + "Person");
        const secondActor = shape(
            "second-actor",
            ElementTypes.ACTOR + "Person",
        );
        const work = shape("work", ElementTypes.WORKOBJECT + "Document");
        const first = activity("first", firstActor, secondActor, 1);
        const second = activity("second", secondActor, work, 2);

        const replay = createReplayStory(
            [firstActor, secondActor, work, first, second],
            [],
        );

        expect(replay.steps[0].visibleElementIds).toEqual([
            "first-actor",
            "first",
            "second-actor",
        ]);
        expect(replay.steps[1].highlightedElementIds).toEqual([
            "second-actor",
            "second",
            "work",
        ]);
        expect(replay.steps[1].visibleElementIds).toEqual([
            "first-actor",
            "first",
            "second-actor",
            "second",
            "work",
        ]);
    });

    it("includes attached annotations on terminal work objects without mutating them", () => {
        const actor = shape("actor", ElementTypes.ACTOR + "Person");
        const work = shape("work", ElementTypes.WORKOBJECT + "Document");
        const note = shape("note", ElementTypes.TEXTANNOTATION);
        work.outgoing = undefined;
        work.attachers = [note];
        const root = activity("root", actor, work, 1);
        const elements = [actor, work, note, root];
        const before = structuredClone(elements);

        expect(createReplayStory(elements, []).steps[0]).toEqual({
            activityNumber: 1,
            visibleElementIds: ["actor", "root", "work", "note"],
            highlightedElementIds: ["actor", "root", "work", "note"],
        });
        expect(elements).toEqual(before);
    });

    it("terminates a dangling activity while retaining its identifiable source", () => {
        const actor = shape("actor", ElementTypes.ACTOR + "Person");
        const work = shape("work", ElementTypes.WORKOBJECT + "Document");
        const root = activity("root", actor, work, 1);
        const dangling = {
            ...root,
            target: undefined,
        } as unknown as ActivityCanvasObject;

        expect(createReplayStory([actor, dangling], []).steps[0]).toEqual({
            activityNumber: 1,
            visibleElementIds: ["actor", "root"],
            highlightedElementIds: ["actor", "root"],
        });
    });

    it("includes group annotations but ignores non-groups and unrelated connections", () => {
        const group = shape("group", ElementTypes.GROUP);
        const note = shape("note", ElementTypes.TEXTANNOTATION);
        const work = shape("work", ElementTypes.WORKOBJECT + "Document");
        group.outgoing = [note, work, undefined].map(
            (target, index) =>
                ({
                    id: `link-${index}`,
                    type: ElementTypes.CONNECTION,
                    source: group,
                    target,
                }) as unknown as ActivityCanvasObject,
        );

        expect(createReplayStory([], [work, group])).toEqual({
            steps: [],
            groupElementIds: ["group", "link-0", "note"],
        });
    });
});
