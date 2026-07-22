import { describe, expect, it } from "vitest";
import {
    ICON_CSS_CLASS_PREFIX,
    IconDictionaryService,
} from "../IconDictionaryService";
import { Dictionary } from "../../../domain/entities/dictionary";
import { IconStyleSheetPort } from "../../domain/ports/IconStyleSheetPort";

/**
 * Regression cover for issue #4: a custom icon whose name contains a dot must
 * still yield a valid CSS class, and the class the service publishes must be the
 * exact one the palette looks up. Since the DOM/CSSOM write now lives behind
 * IconStyleSheetPort, this test proves only that the service delegates the right
 * class; the injection itself is covered by IconCssInjector.spec.ts.
 */
class RecordingStyleSheetPort implements IconStyleSheetPort {
    readonly calls: Array<[string, string]> = [];

    addIconStyle(cssClassName: string, svgMarkup: string): void {
        this.calls.push([cssClassName, svgMarkup]);
    }
}

describe("IconDictionaryService CSS class generation", () => {
    it("turns a dot-containing name into a valid CSS class token", () => {
        const service = new IconDictionaryService(
            new RecordingStyleSheetPort(),
        );

        const cssClass = service.getCSSClassOfIcon("my.icon.v2");

        expect(cssClass).toBe("icon-domain-story-my_icon_v2");
        // Stripped of the prefix, the token must be a legal CSS identifier
        // (starts with a letter/underscore, no dots) — the actual bug was that
        // the old sanitizer left the interior dots in place.
        expect(cssClass.slice(ICON_CSS_CLASS_PREFIX.length)).toMatch(
            /^[a-zA-Z_][a-zA-Z0-9_-]*$/,
        );
    });

    describe("addIconsToCss", () => {
        it("delegates each icon to the port under the palette's own class", () => {
            const port = new RecordingStyleSheetPort();
            const service = new IconDictionaryService(port);
            const icons = new Dictionary();
            icons.add("<svg/>", "my.icon.v2");

            service.addIconsToCss(icons);

            // The regression itself: the class handed to the port must equal
            // the one the palette computes for the same name.
            expect(port.calls).toEqual([
                [service.getCSSClassOfIcon("my.icon.v2"), "<svg/>"],
            ]);
            expect(port.calls[0][0]).toBe("icon-domain-story-my_icon_v2");
        });
    });
});
