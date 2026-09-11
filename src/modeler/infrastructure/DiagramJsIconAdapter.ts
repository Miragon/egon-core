import type Diagram from "diagram-js";
import type EventBus from "diagram-js/lib/core/EventBus";
import type ElementRegistry from "diagram-js/lib/core/ElementRegistry";

import {
    IconDictionaryService,
    IconSetImportExportService,
} from "../../iconSet/service";
import { ElementTypes, getIconId } from "../../story/domain/elementTypes";
import { Dictionary } from "../../story/domain/dictionary";
import {
    createDebouncedCallback,
    type DebouncedCallback,
} from "../../shared/infrastructure/debounce";
import { reportPostCommitError } from "../../shared/infrastructure/reportError";
import type { EditorSession, EditorSessionOwner } from "./EditorSessionOwner";

import { IconPort } from "../domain/ports";
import {
    IconCategory,
    IconSet,
    IconSetData,
} from "../../iconSet/domain/IconTypes";

/**
 * Infrastructure adapter that implements IconPort using diagram-js icon services.
 * This adapter isolates all diagram-js icon-related dependencies.
 */
export class DiagramJsIconAdapter implements IconPort {
    private readonly sessionOwner?: EditorSessionOwner;
    private readonly fixedDiagram?: Diagram;
    private readonly stopFollowingPromotions?: () => void;
    private readonly callbackRegistry: Map<
        (icons: IconSet) => void,
        DebouncedCallback
    > = new Map();

    constructor(diagramOrOwner: Diagram | EditorSessionOwner) {
        if ("getActiveDiagram" in diagramOrOwner) {
            this.sessionOwner = diagramOrOwner;
            this.stopFollowingPromotions = diagramOrOwner.onPromotion(
                (previous, current) =>
                    this.transferSubscriptions(previous, current),
            );
        } else {
            this.fixedDiagram = diagramOrOwner;
        }
    }

    loadIcons(icons: Partial<IconSetData>): void {
        const iconSetConfig =
            this.iconSetImportExportService().createIconSetConfiguration({
                // fall back to the currently loaded name so reloading icons
                // after an import does not strip the icon-set name from the
                // next export
                name:
                    icons.name ?? this.iconDictionaryService().getIconSetName(),
                actors: icons.actors ?? {},
                workObjects: icons.workObjects ?? {},
            });

        this.iconSetImportExportService().loadConfiguration(iconSetConfig);
        this.fireIconsChangedEvent();
    }

    addIcon(category: IconCategory, name: string, svg: string): void {
        const diagram = this.diagram();
        const elementType = this.toElementType(category);
        const iconDictionaryService = this.iconDictionaryService(diagram);

        const sanitized = iconDictionaryService.upsertIconForType(
            elementType,
            name,
            svg,
        );
        this.addIconToCss(iconDictionaryService, name, sanitized);
        this.repaintMatchingIcons(diagram, name);
        this.fireIconsChangedEvent(diagram);
    }

    removeIcon(category: IconCategory, name: string): void {
        const elementType = this.toElementType(category);
        this.iconDictionaryService().unregisterIconForType(elementType, name);
        this.fireIconsChangedEvent();
    }

    getIcons(): IconSet {
        const config =
            this.iconSetImportExportService().getCurrentConfigurationForExport();
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
        if (this.callbackRegistry.has(callback)) {
            return;
        }
        const wrapped = createDebouncedCallback(() => {
            try {
                callback(this.getIcons());
            } catch (error) {
                reportPostCommitError(error);
            }
        });
        this.callbackRegistry.set(callback, wrapped);
        (this.eventBus().on as any)("dst.config.changed", wrapped);
    }

    offIconsChanged(callback: (icons: IconSet) => void): void {
        const wrapped = this.callbackRegistry.get(callback);
        if (wrapped) {
            (this.eventBus().off as any)("dst.config.changed", wrapped);
            // Cancel too: dropping the registry entry would otherwise leave an
            // armed timer nobody can reach, firing ~100 ms after off().
            wrapped.cancel();
            this.callbackRegistry.delete(callback);
        }
    }

    /**
     * Detaches and disarms every subscription.
     *
     * Must run before the modeler port tears the injector down: this adapter's
     * callback reads `getIcons()` off injector-owned services, so a timer that
     * survives teardown queries a destroyed injector.
     */
    destroy(): void {
        this.callbackRegistry.forEach((wrapped) => {
            (this.eventBus().off as any)("dst.config.changed", wrapped);
            wrapped.cancel();
        });
        this.callbackRegistry.clear();
        this.stopFollowingPromotions?.();
    }

    private toElementType(category: IconCategory): ElementTypes {
        return category === "actor"
            ? ElementTypes.ACTOR
            : ElementTypes.WORKOBJECT;
    }

    private addIconToCss(
        iconDictionaryService: IconDictionaryService,
        name: string,
        svg: string,
    ): void {
        const dict = new Dictionary<string>();
        dict.set(name, svg);
        iconDictionaryService.addIconsToCss(dict);
    }

    private repaintMatchingIcons(diagram: Diagram, name: string): void {
        const matchingShapes = diagram
            .get<ElementRegistry>("elementRegistry")
            .getAll()
            .filter((element) => {
                const type = element["type"];
                return (
                    !element["labelTarget"] &&
                    typeof type === "string" &&
                    (type.startsWith(ElementTypes.ACTOR) ||
                        type.startsWith(ElementTypes.WORKOBJECT)) &&
                    getIconId(type) === name
                );
            });

        if (matchingShapes.length > 0) {
            this.eventBus(diagram).fire("elements.changed", {
                elements: matchingShapes,
            });
        }
    }

    private fireIconsChangedEvent(diagram: Diagram = this.diagram()): void {
        this.eventBus(diagram).fire("dst.config.changed", {
            iconSet: this.getIconsFrom(diagram),
        });
    }

    private diagram(): Diagram {
        return this.sessionOwner?.getActiveDiagram() ?? this.fixedDiagram!;
    }

    private eventBus(diagram: Diagram = this.diagram()): EventBus {
        return diagram.get<EventBus>("eventBus");
    }

    private iconDictionaryService(
        diagram: Diagram = this.diagram(),
    ): IconDictionaryService {
        return diagram.get<IconDictionaryService>(
            "domainStoryIconDictionaryService",
        );
    }

    private iconSetImportExportService(
        diagram: Diagram = this.diagram(),
    ): IconSetImportExportService {
        return diagram.get<IconSetImportExportService>(
            "domainStoryIconSetImportExportService",
        );
    }

    private getIconsFrom(diagram: Diagram): IconSet {
        const config =
            this.iconSetImportExportService(
                diagram,
            ).getCurrentConfigurationForExport();
        return {
            actors: config?.actors ?? {},
            workObjects: config?.workObjects ?? {},
        };
    }

    private transferSubscriptions(
        previous: EditorSession,
        current: EditorSession,
    ): void {
        this.callbackRegistry.forEach((wrapped) => {
            (previous.eventBus.off as any)("dst.config.changed", wrapped);
            wrapped.cancel();
            (current.eventBus.on as any)("dst.config.changed", wrapped);
        });
    }
}
