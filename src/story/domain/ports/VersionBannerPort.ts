/**
 * Port through which the importer surfaces the imported file's version without
 * owning any DOM detail. The import service knows *when* a version should be
 * shown; it must not know *how* that becomes a rendered element — the
 * instance-local canvas lookup and diagram-js `html`/`render` call are outer-
 * layer concerns. Keeping this interface import-free lets the
 * domain-purity rules in architecture.spec.ts hold: an infrastructure adapter
 * implements it and is injected at runtime (service name
 * `domainStoryVersionBanner`).
 */
export interface VersionBannerPort {
    /** Render a banner announcing the imported story's `version`. */
    show(version: string): void;
}
