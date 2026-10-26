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
        // Typed as the base diagram-js factory so story does not depend on
        // modeler infrastructure, which the architecture tests forbid.
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

    /** Accepts any historical EGN shape, as an object or a JSON string. */
    import(story: unknown): void {
        const prepared = this.prepare(story);
        this.materialize(prepared);
    }

    /**
     * Touches no editor-owned service, so the result can be materialized in an
     * isolated candidate session.
     */
    prepare(story: unknown): PreparedImport {
        const parsed = typeof story === "string" ? JSON.parse(story) : story;
        const { iconSetConfiguration, domainStory } = parseExportFile(parsed);
        const availableIconNames = new Set(
            this.iconDictionaryService.getFullDictionary().keysArray(),
        );
        if (iconSetConfiguration) {
            Object.keys(iconSetConfiguration.actors).forEach((name) =>
                availableIconNames.add(name),
            );
            Object.keys(iconSetConfiguration.workObjects).forEach((name) =>
                availableIconNames.add(name),
            );
        }

        this.importRepairService.removeWhitespacesFromIcons(
            domainStory.businessObjects,
            availableIconNames,
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

        // After the type rename, so these classify against today's type names.
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

    materialize(prepared: PreparedImport): void {
        const iconSet: IconSet =
            this.iconSetImportExportService.createIconSetConfiguration(
                prepared.iconSetConfiguration,
            );
        const groupElements = new Map<string, ElementLike>();

        this.iconSetImportExportService.loadConfiguration(iconSet);
        this.eventBus.fire("dst.config.changed", { iconSet });

        // Groups parent-before-child, then shapes, then connections, so nested
        // groups keep their membership even when an export lists a child first.
        this.addGroupsInDependencyOrder(prepared.groups, groupElements);
        prepared.shapes.forEach((shape) =>
            this.createShape(shape, groupElements),
        );
        prepared.connections.forEach((connection) =>
            this.addConnection(connection),
        );

        this.versionBanner.show(prepared.metadata.version);

        // Internal half of the public `import.repaired` event (ADR DOC-2), so a
        // host can tell the user the file was lossy.
        if (prepared.removedConnections.length > 0) {
            this.eventBus.fire("dst.import.repaired", {
                removedConnections: prepared.removedConnections,
            });
        }

        // The element registry holds only diagram elements, so story metadata
        // would otherwise be lost on the next export.
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
                // No `parentIndex`, so diagram-js appends. A NaN index (from an
                // id like "shape_1683") would splice at 0 and reverse children.
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
     * Adds a nested group only after its parent is live, otherwise keeping
     * input order. Groups with a missing or cyclic parent fall back to the
     * root.
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

            // Every remaining parent is missing, not a group, or cyclic: keep
            // the groups at the root and drop their stale parent id.
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
