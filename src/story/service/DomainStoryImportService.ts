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
import { parseExportFile, validateRetainedGeometry } from "./ExportFileParser";
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
import {
    PreparedConnection,
    PreparedImport,
    PreparedShape,
} from "./PreparedImport";

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
    import(story: unknown): void {
        const prepared = this.prepare(story);
        this.materialize(prepared);
    }

    /**
     * Normalize, validate, and repair an untrusted import without touching any
     * editor-owned service. The returned value is safe to materialize in an
     * isolated candidate session.
     */
    prepare(story: unknown): PreparedImport {
        const parsed = typeof story === "string" ? JSON.parse(story) : story;
        const { iconSetConfiguration, domainStory } = parseExportFile(parsed);

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

        let domainStoryElements = prunedElements;
        if (needsPreV050Repair(domainStory.version)) {
            domainStoryElements =
                this.importRepairService.updateCustomElementsPreviousV050(
                    domainStoryElements,
                );
        }

        // Two repairs the *renderer* used to perform on every paint (#74).
        // Drawing is a read now, so they happen here — once, before the canvas
        // sees the story. Order matters only in that both run after the type
        // rename above, so they classify against today's type names.
        this.importRepairService.restoreAnnotationHeights(domainStoryElements);
        this.importRepairService.numberUnnumberedActivitiesFromActors(
            domainStoryElements,
        );

        validateRetainedGeometry(domainStoryElements);

        const connections: PreparedConnection[] = [],
            groups: PreparedShape[] = [],
            shapes: PreparedShape[] = [];

        domainStoryElements.forEach((bo) => {
            if (isOfTypeConnection(bo)) {
                connections.push(this.prepareConnection(bo));
            } else if (isOfTypeGroup(bo)) {
                groups.push(this.prepareShape(bo));
            } else {
                shapes.push(this.prepareShape(bo));
            }
        });

        return {
            iconSetConfiguration,
            metadata: {
                title: domainStory.title,
                description: domainStory.description,
                version: domainStory.version,
                scope: domainStory.scope,
            },
            groups,
            shapes,
            connections,
            removedConnections,
        };
    }

    /** Materialize a prepared import into this service's editor session. */
    materialize(prepared: PreparedImport): void {
        const iconSet: IconSet =
            this.iconSetImportExportService.createIconSetConfiguration(
                prepared.iconSetConfiguration,
            );
        const groupElements = new Map<string, ElementLike>();

        this.iconSetImportExportService.loadConfiguration(iconSet);
        this.eventBus.fire("dst.config.changed", { iconSet });

        // Add groups in parent-before-child order, then the remaining shapes,
        // then connections. This lets nested groups retain their persisted
        // membership even when a stable id-sorted export puts a child first.
        this.addGroupsInDependencyOrder(prepared.groups, groupElements);
        prepared.shapes.forEach((shape) =>
            this.createShape(shape, groupElements),
        );
        prepared.connections.forEach((connection) =>
            this.addConnection(connection),
        );

        this.versionBanner.show(prepared.metadata.version);

        // Surface the repair so a host can tell the user the file was lossy.
        // This is the internal half of the public `import.repaired` event
        // (ADR 0017): `DiagramJsModelerAdapter` listens here and re-emits the
        // dropped ids through `ModelerPort`. Fired only when something was
        // actually dropped, so a host handler doubles as "the file was damaged".
        if (prepared.removedConnections.length > 0) {
            this.eventBus.fire("dst.import.repaired", {
                removedConnections: prepared.removedConnections,
            });
        }

        // Persist story-level metadata: the element registry keeps only diagram
        // elements, so without this the title/description/scope would be lost
        // on the next export.
        this.propertiesService.setProperties(
            prepared.metadata.title,
            prepared.metadata.description,
            prepared.metadata.scope,
            prepared.metadata.version,
        );
    }

    private createShape(
        prepared: PreparedShape,
        groupElements: Map<string, ElementLike>,
    ) {
        const businessObject = prepared.businessObject as unknown as Record<
            string,
            unknown
        >;
        delete businessObject["children"];
        delete businessObject["parent"];

        const attributes = {
            businessObject,
            id: prepared.id,
            type: prepared.type,
            x: prepared.x,
            y: prepared.y,
            width: prepared.width,
            height: prepared.height,
            name: businessObject["name"] as string,
            ...(typeof businessObject["text"] === "string"
                ? { text: businessObject["text"] }
                : {}),
        };
        const shape = this.elementFactory.create("shape", attributes);

        if (isOfTypeGroup(prepared.businessObject)) {
            groupElements.set(prepared.id, shape);
        }

        if (prepared.parentId) {
            const parentShape = groupElements.get(prepared.parentId);

            if (isOfTypeGroup(parentShape)) {
                // No `parentIndex`: diagram-js appends when it is omitted, which
                // is the intent. Passing `Number(parentShape.id)` — as this did —
                // yields NaN for ids like "shape_1683"; diagram-js normalizes only
                // non-numbers to -1 and `typeof NaN === "number"` slips through to
                // `splice(NaN, …)`, i.e. index 0, prepending children in reverse.
                const addedShape = this.canvas.addShape(shape, parentShape);
                // diagram-js needs the live shape reference above; EGN persists
                // the corresponding group's id on the business object instead.
                businessObject["parent"] = prepared.parentId;
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
    private addGroupsInDependencyOrder(
        groups: PreparedShape[],
        groupElements: Map<string, ElementLike>,
    ): void {
        const unresolved = [...groups];

        while (unresolved.length > 0) {
            let madeProgress = false;

            for (let index = 0; index < unresolved.length;) {
                const group = unresolved[index];
                const parentId = group.parentId;

                if (!parentId || groupElements.has(parentId)) {
                    this.createShape(group, groupElements);
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
                delete (
                    group.businessObject as unknown as Record<string, unknown>
                )["parent"];
                this.createShape(
                    { ...group, parentId: undefined },
                    groupElements,
                );
            });
            return;
        }
    }

    // FIXME: use an actual type for element. It should be BusinessObject from the domain.
    private addConnection(prepared: PreparedConnection) {
        const connection = this.elementFactory.create("connection", {
            businessObject: prepared.businessObject,
            id: prepared.id,
            type: prepared.type,
            name: prepared.businessObject.name,
            waypoints: prepared.waypoints,
            source: this.elementRegistry.get(prepared.sourceId),
            target: this.elementRegistry.get(prepared.targetId),
        } as any);

        return this.canvas.addConnection(connection);
    }

    private prepareShape(businessObject: BusinessObject): PreparedShape {
        const defaultSize = isOfTypeGroup(businessObject)
            ? { width: 300, height: 200 }
            : businessObject.type.startsWith("domainStory:textAnnotation")
              ? { width: 100, height: 30 }
              : { width: 75, height: 75 };
        const record = businessObject as unknown as Record<string, unknown>;
        return {
            businessObject,
            id: businessObject.id,
            type: businessObject.type,
            x: businessObject.x,
            y: businessObject.y,
            width: businessObject.width ?? defaultSize.width,
            height: businessObject.height ?? defaultSize.height,
            parentId:
                typeof record["parent"] === "string"
                    ? record["parent"]
                    : undefined,
        };
    }

    private prepareConnection(
        businessObject: BusinessObject,
    ): PreparedConnection {
        const record = businessObject as unknown as Record<string, unknown>;
        return {
            businessObject,
            id: businessObject.id,
            type: businessObject.type,
            sourceId: record["source"] as string,
            targetId: record["target"] as string,
            waypoints: record["waypoints"] as PreparedConnection["waypoints"],
        };
    }
}

function isOfTypeConnection(element: BusinessObject) {
    return isActivity(element) || isConnection(element);
}

function isOfTypeGroup(element: BusinessObject | ElementLike | undefined) {
    return isGroup(element);
}
