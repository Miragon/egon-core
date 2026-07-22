import DomainServiceModule from "../../domain/service";
import { DomainStoryImportService } from "./DomainStoryImportService";

export default {
    // depend on the shared domain services so `domainStoryPropertiesService`
    // (written on import, read on export) is registered in the injector.
    __depends__: [DomainServiceModule],
    __init__: ["domainStoryImportService"],
    domainStoryImportService: ["type", DomainStoryImportService],
};
