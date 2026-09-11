import { describe, expect, it, vi } from "vitest";
import EventBus from "diagram-js/lib/core/EventBus";

import { ElementTypes } from "../../../../story/domain/elementTypes";
import { ColorPickerCoordinator } from "../ColorPickerCoordinator";
import { ColorPickerPreviewState } from "../ColorPickerPreviewState";

function element(id: string, type: string, pickedColor?: string): any {
    return {
        id,
        type,
        incoming: [],
        businessObject: { id, type, pickedColor },
    };
}

function setup(initial: any[]) {
    const eventBus = new EventBus();
    let selected = initial.slice();
    const registered = new Map(initial.map((item) => [item.id, item]));
    const commandStack = { execute: vi.fn() };
    const previewState = new ColorPickerPreviewState();
    const coordinator = new ColorPickerCoordinator(
        eventBus,
        { get: (id: string) => registered.get(id) } as any,
        { get: () => selected.slice() } as any,
        commandStack as any,
        previewState,
    );
    const requested: any[] = [];
    const closed: any[] = [];
    const changed: any[] = [];
    eventBus.on("dst.colorPicker.requested", (event: any) =>
        requested.push(event),
    );
    eventBus.on("dst.colorPicker.closed", (event: any) => closed.push(event));
    eventBus.on("element.changed", (event: any) => changed.push(event.element));
    return {
        coordinator,
        previewState,
        commandStack,
        eventBus,
        requested,
        closed,
        changed,
        select(elements: any[]) {
            const oldSelection = selected;
            selected = elements.slice();
            eventBus.fire("selection.changed", {
                oldSelection,
                newSelection: selected,
            });
        },
        replaceRegistered(id: string, replacement: any) {
            registered.set(id, replacement);
        },
    };
}

function open(subject: ReturnType<typeof setup>, target: any | any[]): string {
    expect(subject.coordinator.request(target)).toBe(true);
    return subject.requested.at(-1).requestId;
}

describe("ColorPickerCoordinator", () => {
    it("captures an immutable target snapshot and initial color on click", () => {
        const actor = element("Actor_1", ElementTypes.ACTOR, "#12345680");
        const subject = setup([actor]);

        open(subject, actor);

        expect(subject.requested[0]).toMatchObject({
            elementIds: ["Actor_1"],
            color: "rgba(18,52,86,0.5)",
        });
    });

    it("accepts repeated previews without writing the model or command stack", () => {
        const actor = element("Actor_1", ElementTypes.ACTOR);
        const subject = setup([actor]);
        const requestId = open(subject, actor);

        expect(subject.coordinator.preview(requestId, "#ff0000")).toBe(true);
        expect(subject.coordinator.preview(requestId, "#00ff00")).toBe(true);

        expect(subject.previewState.get(actor)).toBe("#00ff00");
        expect(actor.businessObject.pickedColor).toBeUndefined();
        expect(subject.commandStack.execute).not.toHaveBeenCalled();
        expect(subject.changed).toEqual([actor, actor]);
    });

    it("previews and clears an annotation and its incoming connector together", () => {
        const annotation = element("Annotation_1", ElementTypes.TEXTANNOTATION);
        const connector = element("Connection_1", ElementTypes.CONNECTION);
        annotation.incoming = [connector];
        const subject = setup([annotation]);
        const requestId = open(subject, annotation);

        subject.coordinator.preview(requestId, "#ff0000");
        expect(subject.previewState.get(annotation)).toBe("#ff0000");
        expect(subject.previewState.get(connector)).toBe("#ff0000");

        expect(subject.coordinator.cancel(requestId)).toBe(true);
        expect(subject.previewState.get(annotation)).toBeUndefined();
        expect(subject.previewState.get(connector)).toBeUndefined();
        expect(subject.changed).toEqual([
            annotation,
            connector,
            annotation,
            connector,
        ]);
    });

    it("confirms through one color command per target and then closes", () => {
        const alpha = element("Actor_1", ElementTypes.ACTOR, "#1234");
        const named = element("Actor_2", ElementTypes.ACTOR, "black");
        const subject = setup([alpha, named]);
        const requestId = open(subject, [alpha, named]);

        expect(
            subject.coordinator.confirm(requestId, "rgba(1, 2, 3, .5)"),
        ).toBe(true);

        expect(subject.commandStack.execute).toHaveBeenNthCalledWith(
            1,
            "element.colorChange",
            expect.objectContaining({ element: alpha, newColor: "#01020380" }),
        );
        expect(subject.commandStack.execute).toHaveBeenNthCalledWith(
            2,
            "element.colorChange",
            expect.objectContaining({
                element: named,
                newColor: "rgba(1, 2, 3, .5)",
            }),
        );
        expect(subject.closed).toHaveLength(1);
        expect(subject.closed[0].requestId).toBe(requestId);
        expect(subject.coordinator.confirm(requestId, "#ffffff")).toBe(false);
    });

    it("replaces one active request without letting stale cancellation affect its successor", () => {
        const actor = element("Actor_1", ElementTypes.ACTOR);
        const subject = setup([actor]);
        const first = open(subject, actor);
        const second = open(subject, actor);

        expect(first).not.toBe(second);
        expect(subject.closed.map(({ requestId }) => requestId)).toEqual([
            first,
        ]);
        expect(subject.coordinator.cancel(first)).toBe(false);
        expect(subject.coordinator.preview(second, "#abcdef")).toBe(true);
    });

    it("rejects foreign ids without changing the active request", () => {
        const actor = element("Actor_1", ElementTypes.ACTOR);
        const subject = setup([actor]);
        const requestId = open(subject, actor);

        expect(subject.coordinator.preview("foreign", "#ff0000")).toBe(false);
        expect(subject.coordinator.cancel("foreign")).toBe(false);
        expect(subject.closed).toHaveLength(0);
        expect(subject.coordinator.cancel(requestId)).toBe(true);
    });

    it("invalidates permanently on selection change, command, pad close, or identity replacement", () => {
        const actor = element("Actor_1", ElementTypes.ACTOR);
        const subject = setup([actor]);

        const selectionRequest = open(subject, actor);
        subject.select([]);
        subject.select([actor]);
        expect(subject.coordinator.preview(selectionRequest, "#ff0000")).toBe(
            false,
        );

        const commandRequest = open(subject, actor);
        subject.eventBus.fire("commandStack.execute", {
            command: "shape.move",
        });
        expect(subject.coordinator.cancel(commandRequest)).toBe(false);

        const closeRequest = open(subject, actor);
        subject.eventBus.fire("contextPad.close", {});
        expect(subject.coordinator.cancel(closeRequest)).toBe(false);

        const identityRequest = open(subject, actor);
        subject.replaceRegistered(
            actor.id,
            element(actor.id, ElementTypes.ACTOR),
        );
        expect(subject.coordinator.preview(identityRequest, "#ff0000")).toBe(
            false,
        );
        expect(subject.closed.at(-1).requestId).toBe(identityRequest);
    });

    it("returns false and emits no close callback after destruction", () => {
        const actor = element("Actor_1", ElementTypes.ACTOR);
        const subject = setup([actor]);
        const requestId = open(subject, actor);
        subject.coordinator.preview(requestId, "#ff0000");

        subject.eventBus.fire("diagram.destroy", {});

        expect(subject.coordinator.preview(requestId, "#00ff00")).toBe(false);
        expect(subject.coordinator.confirm(requestId, "#00ff00")).toBe(false);
        expect(subject.coordinator.cancel(requestId)).toBe(false);
        expect(subject.closed).toHaveLength(0);
        expect(subject.previewState.get(actor)).toBeUndefined();
    });
});
