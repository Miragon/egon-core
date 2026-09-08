import type { IconSanitizerPort } from "../../iconSet/domain/ports/IconSanitizerPort";

/** Keeps pre-sanitizer unit tests focused on their original collaboration. */
export const passThroughIconSanitizer: IconSanitizerPort = {
    sanitize: (source) => source,
    prepareForRendering: (source) => source,
};
