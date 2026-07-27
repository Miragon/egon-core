import { assign } from "min-dash";
import Canvas from "diagram-js/lib/core/Canvas";
import {
    Connection,
    ElementLike,
    Label,
    Root,
    Shape,
} from "diagram-js/lib/model/Types";
import EventBus from "diagram-js/lib/core/EventBus";
import ElementRegistry from "diagram-js/lib/core/ElementRegistry";
import ElementFactory from "diagram-js/lib/core/ElementFactory";
import { ImportRepairService } from "./ImportRepairService";
import { parseExportFile } from "./ExportFileParser";
import { BusinessObject } from "../domain/businessObject";
import { isActivity, isConnection, isGroup } from "../domain/elementPredicates";
import { needsPreV050Repair } from "../domain/importRepair";
import { VersionBannerPort } from "../domain/ports/VersionBannerPort";
import {
    IconDictionaryService,
    IconSetImportExportService,
} from "../../iconSet/service";
import { IconSet } from "../domain/iconSet";
import { DomainStoryPropertiesService } from "../../modeler/service";

export class DomainStoryImportService {
    static $inject: string[] = [
        "eventBus",
        "canvas",
        "elementRegistry",
        "elementFactory",
        "domainStoryIconDictionaryService",
        "domainStoryIconSetImportExportService",
        "domainStoryPropertiesService",
        "domainStoryVersionBanner",
    ];

    /**
     * Group shapes already added to the canvas, by business-object id, so a
     * child can be parented onto its group. Cleared at the top of every
     * `import()`: a second import runs after `diagram.clear`, and stale entries
     * would parent new shapes onto shapes that no longer exist.
     */
    private readonly groupElements = new Map<string, ElementLike>();

    private readonly importRepairService = new ImportRepairService();

    constructor(
        private readonly eventBus: EventBus,
        private readonly canvas: Canvas,
        private readonly elementRegistry: ElementRegistry,
        // Base diagram-js type, not the concrete DomainStoryElementFactory: didi
        // still injects the concrete factory, but typing against the base keeps
        // this service (story) from statically depending on modeler's
        // infrastructure — a hexagon violation the architecture tests forbid.
        private readonly elementFactory: ElementFactory<
            Connection,
            Label,
            Root,
            Shape
        >,
        private readonly iconDictionaryService: IconDictionaryService,
        private readonly iconSetImportExportService: IconSetImportExportService,
        private readonly propertiesService: DomainStoryPropertiesService,
        private readonly versionBanner: VersionBannerPort,
    ) {}

    /**
     * Imports a serialized EGN file (any historical shape) onto the canvas.
     * The parser normalizes v4/legacy/string payloads up front so this method
     * only ever deals with a clean `{ iconSet, businessObjects, metadata }`.
     *
     * @throws Error if import fails
     * @param story serialized `{ iconSet, domainStory }` (or a legacy shape)
     */
    import(story: string) {
        const parsed = JSON.parse(story);

        const { iconSetConfiguration, domainStory } = parseExportFile(parsed);

        const iconSet: IconSet =
            this.iconSetImportExportService.createIconSetConfiguration(
                iconSetConfiguration,
            );

        this.importRepairService.removeWhitespacesFromIcons(
            domainStory.businessObjects,
        );
        this.importRepairService.removeUnnecessaryBpmnProperties(
            domainStory.businessObjects,
        );
        const { elements: prunedElements, removedConnections } =
            this.importRepairService.checkForUnreferencedElementsInActivitiesAndRepair(
                domainStory.businessObjects,
            );

        this.eventBus.fire("diagram.clear", {});
        // A previous import's groups were just destroyed; keeping their shapes
        // would parent this story's children onto dead elements.
        this.groupElements.clear();

        // The normalizer already stripped web-only trailers; the version now
        // lives on the story. Feed it through so pre-v0.5.0 files still get the
        // custom-element repair and the version box renders as before.
        const domainStoryElements = this.handleVersionNumber(
            domainStory.version,
            prunedElements,
        );

        // Two repairs the *renderer* used to perform on every paint (#74).
        // Drawing is a read now, so they happen here — once, before the canvas
        // sees the story. Order matters only in that both run after the type
        // rename above, so they classify against today's type names.
        this.importRepairService.restoreAnnotationHeights(domainStoryElements);
        this.importRepairService.numberUnnumberedActivitiesFromActors(
            domainStoryElements,
        );

        const connections: Connection[] = [],
            groups: Shape[] = [],
            otherElementTypes: ElementLike[] = [];

        domainStoryElements.forEach(function (bo: any) {
            if (isOfTypeConnection(bo)) {
                connections.push(bo as unknown as Connection);
            } else if (isOfTypeGroup(bo)) {
                groups.push(bo as unknown as Shape);
            } else {
                otherElementTypes.push(bo);
            }
        });

        this.iconSetImportExportService.loadConfiguration(iconSet);
        this.eventBus.fire("dst.config.changed", { iconSet });

        // add groups before shapes and other element types before connections so that connections
        // can already rely on the shapes being part of the diagram
        groups.forEach(this.createElementFromBusinessObject, this);
        otherElementTypes.forEach(this.createElementFromBusinessObject, this);
        connections.forEach(this.addConnection, this);

        // Surface the repair so a host can tell the user the file was lossy.
        // Internal diagram-js event on purpose: the public EgonClient API is
        // frozen by ADR 0010 and widening it needs its own decision, while a
        // host can already subscribe via `additionalModules`.
        if (removedConnections.length > 0) {
            this.eventBus.fire("dst.import.repaired", { removedConnections });
        }

        // Persist story-level metadata: the element registry keeps only diagram
        // elements, so without this the title/description/scope would be lost
        // on the next export.
        this.propertiesService.setProperties(
            domainStory.title,
            domainStory.description,
            domainStory.scope,
            domainStory.version,
        );
    }

    private createElementFromBusinessObject(businessObject: any) {
        const parentId = businessObject.parent;
        delete businessObject.children;
        delete businessObject.parent;

        const attributes = assign({ businessObject }, businessObject);
        const shape = this.elementFactory.create("shape", attributes);

        if (isOfTypeGroup(businessObject)) {
            this.groupElements.set(businessObject.id, shape);
        }

        if (parentId) {
            const parentShape = this.groupElements.get(parentId);

            if (isOfTypeGroup(parentShape)) {
                // No `parentIndex`: diagram-js appends when it is omitted, which
                // is the intent. Passing `Number(parentShape.id)` — as this did —
                // yields NaN for ids like "shape_1683"; diagram-js normalizes only
                // non-numbers to -1 and `typeof NaN === "number"` slips through to
                // `splice(NaN, …)`, i.e. index 0, prepending children in reverse.
                return this.canvas.addShape(shape, parentShape);
            }
        }
        return this.canvas.addShape(shape);
    }

    // FIXME: use an actual type for element. It should be BusinessObject from the domain.
    private addConnection(element: any) {
        const attributes = assign({ businessObject: element }, element);

        if (element.source === undefined || element.target === undefined) {
            throw new Error("source and target must be defined");
        }

        const connection = this.elementFactory.create(
            "connection",
            assign(attributes, {
                source: this.elementRegistry.get(element.source),
                target: this.elementRegistry.get(element.target),
            }),
            // this.elementRegistry.get(element.source!.id).parent,
        );

        return this.canvas.addConnection(connection);
    }

    private handleVersionNumber(
        importVersionNumber: string,
        elements: BusinessObject[],
    ): BusinessObject[] {
        if (needsPreV050Repair(importVersionNumber)) {
            elements =
                this.importRepairService.updateCustomElementsPreviousV050(
                    elements,
                );
            // TODO: add V050 dialog
            // this.showPreviousV050Dialog(versionPrefix);
        }

        this.versionBanner.show(importVersionNumber);

        return elements;
    }
}

function isOfTypeConnection(element: BusinessObject) {
    return isActivity(element) || isConnection(element);
}

function isOfTypeGroup(element: BusinessObject | ElementLike | undefined) {
    return isGroup(element);
}
