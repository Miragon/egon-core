import { describe, expect, it } from "vitest";
import { Injector } from "didi";
import DomainServiceModule from "../../../modeler/service";
import IconSetModule from "../../../iconSet/service";
import ImportModule from "../importModule";
import ExportModule from "../exportModule";
import { DomainStoryImportService } from "../DomainStoryImportService";
import { DomainStoryExportService } from "../DomainStoryExportService";

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
    // Real diagram-js always registers `config`; IconCssInjector injects
    // `config.domainStoryIconStyleSheet`, and didi throws outright when the
    // `config` provider itself is absent.
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
     * A host composing a subset of the plugin gets only what `__depends__`
     * declares. `ImportModule` injects the two icon-set services, so it has to
     * pull `IconSetModule` in itself — note the module list below deliberately
     * omits it.
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
