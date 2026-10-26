// In `domain/` because EgonClientConfig names it and service code may not
// import infrastructure. A type alias, not an interface: only aliases get the
// implicit index signature that `Record<string, string | number>` bags need.
/** Host-supplied typography for diagram labels. */
export type DomainStoryTextRendererStyle = {
    fontFamily: string;
    fontSize: number;
    fontWeight: string;
    lineHeight: number;
};

/** Partial overrides: anything a host omits keeps the built-in default. */
export interface DomainStoryTextRendererConfig {
    defaultStyle?: Partial<DomainStoryTextRendererStyle>;
    externalStyle?: Partial<DomainStoryTextRendererStyle>;
}
