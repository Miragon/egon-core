/**
 * The importer decides when to show a file's version, not how it renders.
 * Implemented in infrastructure and injected as `domainStoryVersionBanner`.
 */
export interface VersionBannerPort {
    show(version: string): void;
}
