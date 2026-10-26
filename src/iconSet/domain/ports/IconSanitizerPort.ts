/**
 * Imported icon markup is untrusted. Services call {@link sanitize} before
 * retaining or publishing an icon. The renderer calls
 * {@link prepareForRendering} after all transforms, and it must sanitize again
 * before DOM insertion.
 */
export interface IconSanitizerPort {
    /** Return a safe, self-contained icon source or a known inert SVG. */
    sanitize(source: string): string;

    /**
     * Recolours/wraps without string interpolation, then sanitizes the result.
     */
    prepareForRendering(source: string, color: string): string;
}
