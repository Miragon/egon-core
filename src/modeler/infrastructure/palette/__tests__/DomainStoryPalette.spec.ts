import { describe, expect, it, vi } from "vitest";
import Create from "diagram-js/lib/features/create/Create";
import ElementFactory from "diagram-js/lib/core/ElementFactory";
import SpaceTool from "diagram-js/lib/features/space-tool/SpaceTool";
import LassoTool from "diagram-js/lib/features/lasso-tool/LassoTool";
import Palette from "diagram-js/lib/features/palette/Palette";
import EventBus from "diagram-js/lib/core/EventBus";
import { PaletteEntry } from "diagram-js/lib/features/palette/PaletteProvider";

import { DomainStoryPaletteProvider } from "../DomainStoryPalette";
import { IconDictionaryService } from "../../../../iconSet/service";
import { ElementTypes } from "../../../../story/domain/elementTypes";

/** Unit tier: all collaborators come through the constructor, so mocks suffice. */

/** The icon-set shape the provider consumes: a name list per element type. */
function iconDictionaryService(iconsByType: {
    actors: string[];
    workObjects: string[];
}): IconDictionaryService {
    return {
        getIconsAssignedAs: (type: ElementTypes) => ({
            keysArray: () =>
                type === ElementTypes.ACTOR
                    ? iconsByType.actors
                    : iconsByType.workObjects,
        }),
        getCSSClassOfIcon: (name: string) => `icon-${name}`,
    } as unknown as IconDictionaryService;
}

function setup(
    iconsByType: { actors: string[]; workObjects: string[] } = {
        actors: [],
        workObjects: [],
    },
) {
    const palette = {
        registerProvider: vi.fn(),
        _rebuild: vi.fn(),
        _update: vi.fn(),
    };

    const listeners: Record<string, () => void> = {};
    const eventBus = {
        on: (event: string, handler: () => void) => {
            listeners[event] = handler;
        },
    };

    // The palette action stamps the shape id onto the businessObject.
    const createShape = vi.fn((attrs: { type: string }) => ({
        id: `shape_${attrs.type}`,
        type: attrs.type,
        businessObject: {} as Record<string, unknown>,
    }));
    const create = { start: vi.fn() };
    const spaceTool = { activateSelection: vi.fn() };
    const lassoTool = { activateSelection: vi.fn() };

    const provider = new DomainStoryPaletteProvider(
        palette as unknown as Palette,
        eventBus as unknown as EventBus,
        create as unknown as Create,
        { createShape } as unknown as ElementFactory,
        spaceTool as unknown as SpaceTool,
        lassoTool as unknown as LassoTool,
        iconDictionaryService(iconsByType),
    );

    return {
        entries: provider.getPaletteEntries() as Record<string, PaletteEntry>,
        palette,
        listeners,
        createShape,
        create,
    };
}

/** Trigger an entry's click action the way diagram-js' palette would. */
function click(entry: PaletteEntry): void {
    (entry.action as { click: (event: unknown) => void }).click({});
}

describe("DomainStoryPaletteProvider", () => {
    it("keeps actor and work-object entries apart for an icon assigned as both", () => {
        const { entries } = setup({
            actors: ["Person"],
            workObjects: ["Person"],
        });

        expect(entries["domainStory-actorPerson"]).toBeDefined();
        expect(entries["domainStory-workObjectPerson"]).toBeDefined();
        expect(entries["domainStory-actorPerson"].group).toBe("actor");
        expect(entries["domainStory-workObjectPerson"].group).toBe(
            "workObject",
        );
    });

    it("creates the element type matching the entry's own category", () => {
        const { entries, createShape } = setup({
            actors: ["Person"],
            workObjects: ["Person"],
        });

        click(entries["domainStory-actorPerson"]);
        click(entries["domainStory-workObjectPerson"]);

        expect(createShape.mock.calls.map(([attrs]) => attrs.type)).toEqual([
            "domainStory:actorPerson",
            "domainStory:workObjectPerson",
        ]);
    });

    it("titles canvas-object entries after the icon name", () => {
        const { entries } = setup({ actors: ["Person"], workObjects: [] });

        expect(entries["domainStory-actorPerson"].title).toBe("Create Person");
    });

    it("falls back to the short type when an icon carries no name", () => {
        // The only path that reaches the fallback title.
        const { entries } = setup({ actors: [""], workObjects: [] });

        expect(entries["domainStory-actor"].title).toBe("Create actor");
    });

    it("rebuilds the palette when the icon set changes", () => {
        const { palette, listeners } = setup();

        listeners["dst.config.changed"]();

        // Only _rebuild re-queries the providers.
        expect(palette._rebuild).toHaveBeenCalledOnce();
        expect(palette._update).not.toHaveBeenCalled();
    });
});
