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
            groups: BusinessObject[] = [],
            otherElementTypes: BusinessObject[] = [];

        domainStoryElements.forEach(function (bo: any) {
            if (isOfTypeConnection(bo)) {
                connections.push(bo as unknown as Connection);
            } else if (isOfTypeGroup(bo)) {
                groups.push(bo);
            } else {
                otherElementTypes.push(bo);
            }
        });

        this.iconSetImportExportService.loadConfiguration(iconSet);
        this.eventBus.fire("dst.config.changed", { iconSet });

        // Add groups in parent-before-child order, then the remaining shapes,
        // then connections. This lets nested groups retain their persisted
        // membership even when a stable id-sorted export puts a child first.
        this.addGroupsInDependencyOrder(groups);
        otherElementTypes.forEach(this.createElementFromBusinessObject, this);
        connections.forEach(this.addConnection, this);

        // Surface the repair so a host can tell the user the file was lossy.
        // This is the internal half of the public `import.repaired` event
        // (ADR 0017): `DiagramJsModelerAdapter` listens here and re-emits the
        // dropped ids through `ModelerPort`. Fired only when something was
        // actually dropped, so a host handler doubles as "the file was damaged".
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
                const addedShape = this.canvas.addShape(shape, parentShape);
                // diagram-js needs the live shape reference above; EGN persists
                // the corresponding group's id on the business object instead.
                businessObject.parent = parentId;
                return addedShape;
            }
        }
        return this.canvas.addShape(shape);
    }

    /**
     * Add nested groups only after their parent is live on the canvas. Input
     * order is retained wherever it does not conflict with that dependency.
     * Malformed references and cycles cannot be resolved, so those groups fall
     * back to the root without retaining a parent id that would not match the
     * live diagram.
     */
    private addGroupsInDependencyOrder(groups: BusinessObject[]): void {
        const unresolved = [...groups];

        while (unresolved.length > 0) {
            let madeProgress = false;

            for (let index = 0; index < unresolved.length;) {
                const group = unresolved[index];
                const parentId = (group as any).parent;

                if (!parentId || this.groupElements.has(parentId)) {
                    this.createElementFromBusinessObject(group);
                    unresolved.splice(index, 1);
                    madeProgress = true;
                } else {
                    index++;
                }
            }

            if (madeProgress) {
                continue;
            }

            // No remaining group can become resolvable: every parent is either
            // missing, not a group, or part of a cycle. Keep these shapes, but
            // make their persisted state accurately describe their root home.
            unresolved.forEach((group) => {
                delete (group as any).parent;
                this.createElementFromBusinessObject(group);
            });
            return;
        }
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
