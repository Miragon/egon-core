/**
 * Internal boundary for treating imported icon markup as untrusted input.
 *
 * The service layer uses {@link sanitize} before retaining or publishing an
 * icon. The renderer uses {@link prepareForRendering} after all presentation
 * transforms; implementations must sanitize that final markup again before it
 * is parsed into the live canvas DOM.
 */
export interface IconSanitizerPort {
    /** Return a safe, self-contained icon source or a known inert SVG. */
    sanitize(source: string): string;

    /**
     * Recolour/wrap an icon without string interpolation, then apply the final
     * safety policy to the SVG markup returned for DOM insertion.
     */
    prepareForRendering(source: string, color: string): string;
}
