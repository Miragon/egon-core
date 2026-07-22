import type Diagram from "diagram-js";
import type EventBus from "diagram-js/lib/core/EventBus";

import { IconDictionaryService } from "../../iconSet/service/IconDictionaryService";
import { IconSetImportExportService } from "../../iconSet/service/IconSetImportExportService";
import { ElementTypes } from "../../story/domain/elementTypes";
import { Dictionary } from "../../story/domain/dictionary";

import { IconPort } from "../domain/ports";
import {
    IconCategory,
    IconSet,
    IconSetData,
} from "../../iconSet/domain/IconTypes";

const DEFAULT_DEBOUNCE_MS = 100;

/**
 * Infrastructure adapter that implements IconPort using diagram-js icon services.
 * This adapter isolates all diagram-js icon-related dependencies.
 */
export class DiagramJsIconAdapter implements IconPort {
    private readonly iconDictionaryService: IconDictionaryService;
    private readonly iconSetImportExportService: IconSetImportExportService;
    private readonly eventBus: EventBus;
    private readonly callbackRegistry: Map<
        (icons: IconSet) => void,
        (event?: unknown) => void
    > = new Map();

    constructor(diagram: Diagram) {
        this.iconDictionaryService = diagram.get<IconDictionaryService>(
            "domainStoryIconDictionaryService",
        );
        this.iconSetImportExportService =
            diagram.get<IconSetImportExportService>(
                "domainStoryIconSetImportExportService",
            );
        this.eventBus = diagram.get<EventBus>("eventBus");
    }

    loadIcons(icons: Partial<IconSetData>): void {
        const iconSetConfig =
            this.iconSetImportExportService.createIconSetConfiguration({
                // fall back to the currently loaded name so reloading icons
                // after an import does not strip the icon-set name from the
                // next export
                name: icons.name ?? this.iconDictionaryService.getIconSetName(),
                actors: icons.actors ?? {},
                workObjects: icons.workObjects ?? {},
            });

        this.iconSetImportExportService.loadConfiguration(iconSetConfig);
        this.fireIconsChangedEvent();
    }

    addIcon(category: IconCategory, name: string, svg: string): void {
        const elementType = this.toElementType(category);

        this.iconDictionaryService.addIMGToIconDictionary(svg, name);
        this.iconDictionaryService.registerIconForType(elementType, name, svg);
        this.addIconToCss(name, svg);
        this.fireIconsChangedEvent();
    }

    removeIcon(category: IconCategory, name: string): void {
        const elementType = this.toElementType(category);
        this.iconDictionaryService.unregisterIconForType(elementType, name);
        this.fireIconsChangedEvent();
    }

    getIcons(): IconSet {
        const config =
            this.iconSetImportExportService.getCurrentConfigurationForExport();
        return {
            actors: config?.actors ?? {},
            workObjects: config?.workObjects ?? {},
        };
    }

    hasIcon(category: IconCategory, name: string): boolean {
        const icons = this.getIcons();
        const iconMap = category === "actor" ? icons.actors : icons.workObjects;
        return name in iconMap;
    }

    onIconsChanged(callback: (icons: IconSet) => void): void {
        const wrapped = this.createDebouncedCallback(() =>
            callback(this.getIcons()),
        );
        this.callbackRegistry.set(callback, wrapped);
        (this.eventBus.on as any)("dst.config.changed", wrapped);
    }

    offIconsChanged(callback: (icons: IconSet) => void): void {
        const wrapped = this.callbackRegistry.get(callback);
        if (wrapped) {
            (this.eventBus.off as any)("dst.config.changed", wrapped);
            this.callbackRegistry.delete(callback);
        }
    }

    private toElementType(category: IconCategory): ElementTypes {
        return category === "actor"
            ? ElementTypes.ACTOR
            : ElementTypes.WORKOBJECT;
    }

    private addIconToCss(name: string, svg: string): void {
        const dict = new Dictionary();
        dict.add(svg, name);
        this.iconDictionaryService.addIconsToCss(dict);
    }

    private fireIconsChangedEvent(): void {
        this.eventBus.fire("dst.config.changed", { iconSet: this.getIcons() });
    }

    private createDebouncedCallback(
        callback: (event?: unknown) => void,
    ): (event?: unknown) => void {
        let timeoutId: ReturnType<typeof setTimeout> | null = null;
        return (event: any) => {
            if (timeoutId) clearTimeout(timeoutId);
            timeoutId = setTimeout(() => callback(event), DEFAULT_DEBOUNCE_MS);
        };
    }
}
