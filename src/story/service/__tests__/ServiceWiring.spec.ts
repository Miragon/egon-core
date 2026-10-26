import { describe, expect, it } from "vitest";
import { Injector } from "didi";
import DomainServiceModule from "../../../modeler/service";
import IconSetModule from "../../../iconSet/service";
import ImportModule from "../importModule";
import ExportModule from "../exportModule";
import { DomainStoryImportService } from "../DomainStoryImportService";
import { DomainStoryExportService } from "../DomainStoryExportService";

/**
 * A mistyped `$inject` key or a missing module dependency only surfaces at
 * runtime in a live diagram, so this resolves the services through a real didi
 * injector, with the diagram-js primitives stubbed.
 */
const diagramPrimitives = {
    __init__: [],
    eventBus: ["value", { fire() {}, on() {}, off() {} }],
    canvas: ["value", {}],
    elementRegistry: ["value", { getAll: () => [], find: () => undefined }],
    elementFactory: ["value", {}],
    // diagram-js always registers `config`, and didi throws when it is absent
    // (IconCssInjector injects `config.domainStoryIconStyleSheet`).
    config: ["value", {}],
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

    /**
     * `ImportModule` injects the icon-set services, so it must pull in
     * `IconSetModule` itself; the module list below omits it on purpose.
     */
    it("resolves the import service without the icon set module listed explicitly", () => {
        const injector = new Injector([ImportModule, diagramPrimitives]);

        expect(
            injector.get<DomainStoryImportService>("domainStoryImportService"),
        ).toBeInstanceOf(DomainStoryImportService);
        expect(injector.get("domainStoryIconDictionaryService")).toBeDefined();
        expect(
            injector.get("domainStoryIconSetImportExportService"),
        ).toBeDefined();
    });
});
