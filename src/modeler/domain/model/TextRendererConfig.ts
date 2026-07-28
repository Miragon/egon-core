/**
 * Host-supplied typography for diagram labels.
 *
 * Lives in `domain/` rather than beside the renderer because `EgonClientConfig`
 * (service layer) has to name it, and the hexagon rules forbid service →
 * infrastructure imports. Framework-free by construction: plain style values the
 * diagram-js text utility happens to understand.
 *
 * A type alias rather than an `interface` on purpose — only aliases get an
 * implicit index signature, which is what keeps the shape assignable to the
 * `Record<string, string | number>` style bags text layouters take.
 */
export type DomainStoryTextRendererStyle = {
    fontFamily: string;
    fontSize: number;
    fontWeight: string;
    lineHeight: number;
};

/**
 * Both styles are partial overrides: whatever a host leaves out keeps the
 * built-in default, so a caller can change only the font family without having
 * to restate the size, weight and line height.
 */
export interface DomainStoryTextRendererConfig {
    defaultStyle?: Partial<DomainStoryTextRendererStyle>;
    externalStyle?: Partial<DomainStoryTextRendererStyle>;
}
