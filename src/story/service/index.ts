import StoryImportModule from "./importModule";
import StoryExportModule from "./exportModule";

/**
 * Public surface of the story feature. Unlike the other features there is no
 * default export: story ships two independent didi modules (import and export),
 * so they are named explicitly (`StoryImportModule`/`StoryExportModule`) for the
 * plugin to register, alongside the service classes siblings type against.
 */
export { DomainStoryImportService } from "./DomainStoryImportService";
export { DomainStoryExportService } from "./DomainStoryExportService";
export { StoryImportModule, StoryExportModule };
