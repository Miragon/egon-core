import { describe, expect, it } from "vitest";
import { Injector } from "didi";
import DomainServiceModule from "../../../domain/service";
import IconSetModule from "../../../iconSet/service";
import ImportModule from "../index";
import ExportModule from "../../../export/service";
import { DomainStoryImportService } from "../DomainStoryImportService";
import { DomainStoryExportService } from "../../../export/service/DomainStoryExportService";

/**
 * Guards the DI wiring that ties import and export together: both now inject the
 * `domainStoryPropertiesService` that carries story metadata across a round
 * trip. A mistyped `$inject` key or a missing module dependency would only
 * surface at runtime inside a live diagram, so this resolves the services
 * through a real didi injector — with the diagram-js primitives stubbed — to
 * fail fast in CI instead.
 */
const diagramPrimitives = {
    __init__: [],
    eventBus: ["value", { fire() {}, on() {}, off() {} }],
    canvas: ["value", {}],
    elementRegistry: ["value", { getAll: () => [], find: () => undefined }],
    elementFactory: ["value", {}],
};

describe("service DI wiring", () => {
    it("resolves the import and export services with the shared properties service", () => {
        const injector = new Injector([
            DomainServiceModule,
            IconSetModule,
            ImportModule,
            ExportModule,
            diagramPrimitives,
        ]);

        expect(
            injector.get<DomainStoryImportService>("domainStoryImportService"),
        ).toBeInstanceOf(DomainStoryImportService);
        expect(
            injector.get<DomainStoryExportService>("domainStoryExportService"),
        ).toBeInstanceOf(DomainStoryExportService);
        // the round-trip bridge is registered and shared by both services
        expect(injector.get("domainStoryPropertiesService")).toBeDefined();
    });
});
