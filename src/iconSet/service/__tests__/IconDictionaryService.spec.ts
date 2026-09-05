import { describe, expect, it } from "vitest";
import {
    ICON_CSS_CLASS_PREFIX,
    IconDictionaryService,
} from "../IconDictionaryService";
import { Dictionary } from "../../../story/domain/dictionary";
import { ElementTypes } from "../../../story/domain/elementTypes";
import { IconStyleSheetPort } from "../../domain/ports/IconStyleSheetPort";
import { IconSetImportExportService } from "../IconSetImportExportService";
import type { IconSet } from "../../../story/domain/iconSet";

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

function iconSet(
    actors: Record<string, string>,
    workObjects: Record<string, string>,
    name = "icons",
): IconSet {
    return {
        name,
        actors: Dictionary.fromRecord(actors),
        workObjects: Dictionary.fromRecord(workObjects),
    };
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
            const icons = new Dictionary<string>();
            icons.set("my.icon.v2", "<svg/>");

            service.addIconsToCss(icons);

            // The regression itself: the class handed to the port must equal
            // the one the palette computes for the same name.
            expect(port.calls).toEqual([
                [service.getCSSClassOfIcon("my.icon.v2"), "<svg/>"],
            ]);
            expect(port.calls[0][0]).toBe("icon-domain-story-my_icon_v2");
        });
    });

    /**
     * Issue #12: the custom-icon pool is instance-owned, so two services on one
     * page keep separate pools. An icon added to A must be invisible to B — this
     * fails against the pre-#12 module-level `customIcons` global.
     */
    describe("custom-icon isolation between instances", () => {
        it("keeps an icon added to one service out of another", () => {
            const serviceA = new IconDictionaryService(
                new RecordingStyleSheetPort(),
            );
            const serviceB = new IconDictionaryService(
                new RecordingStyleSheetPort(),
            );

            serviceA.addIMGToIconDictionary("<svg/>", "onlyInA");

            expect(serviceA.getFullDictionary().has("onlyInA")).toBe(true);
            expect(serviceB.getFullDictionary().has("onlyInA")).toBe(false);
            expect(serviceB.getIconSource("onlyInA")).toBe("");
        });
    });

    /**
     * getIconSource resolves through a fallback chain: custom pool first, then
     * the selected dictionaries. An icon registered only via registerIconForType
     * (never added to customIcons) must still be found through that fallback.
     */
    describe("getIconSource fallback resolution", () => {
        it("returns '' for a name that is in no dictionary", () => {
            const service = new IconDictionaryService(
                new RecordingStyleSheetPort(),
            );

            expect(service.getIconSource("missing")).toBe("");
        });

        it("finds an icon present only in a selected dictionary", () => {
            const service = new IconDictionaryService(
                new RecordingStyleSheetPort(),
            );

            service.registerIconForType(
                ElementTypes.WORKOBJECT,
                "onlySelected",
                "<svg/>",
            );

            expect(service.getFullDictionary().has("onlySelected")).toBe(false);
            expect(service.getIconSource("onlySelected")).toBe("<svg/>");
        });
    });

    describe("icon-set replacement", () => {
        it.each(["actor", "work object"])(
            "refreshes a re-imported %s in the pool, selection, export, and CSS",
            (category) => {
                const port = new RecordingStyleSheetPort();
                const service = new IconDictionaryService(port);
                const importer = new IconSetImportExportService(service);
                const firstActors: Record<string, string> =
                    category === "actor" ? { Same: "<svg>A</svg>" } : {};
                const firstWorkObjects: Record<string, string> =
                    category === "work object" ? { Same: "<svg>A</svg>" } : {};
                const secondActors: Record<string, string> =
                    category === "actor" ? { Same: "<svg>B</svg>" } : {};
                const secondWorkObjects: Record<string, string> =
                    category === "work object" ? { Same: "<svg>B</svg>" } : {};

                service.updateIconRegistries(
                    iconSet(firstActors, firstWorkObjects, "first"),
                );
                service.updateIconRegistries(
                    iconSet(secondActors, secondWorkObjects, "second"),
                );

                expect(service.getIconSource("Same")).toBe("<svg>B</svg>");
                expect(service.getFullDictionary().get("Same")).toBe(
                    "<svg>B</svg>",
                );
                expect(importer.getCurrentConfigurationForExport()).toEqual({
                    name: "second",
                    actors: secondActors,
                    workObjects: secondWorkObjects,
                });
                expect(port.calls[port.calls.length - 1]).toEqual([
                    service.getCSSClassOfIcon("Same"),
                    "<svg>B</svg>",
                ]);
            },
        );

        it("keeps historical pool entries while replacing the selected set", () => {
            const service = new IconDictionaryService(
                new RecordingStyleSheetPort(),
            );
            const importer = new IconSetImportExportService(service);
            service.updateIconRegistries(
                iconSet({ Old: "<svg>old</svg>" }, {}),
            );

            service.updateIconRegistries(
                iconSet({}, { Current: "<svg>current</svg>" }, "current"),
            );

            expect(service.getFullDictionary().toRecord()).toEqual({
                Old: "<svg>old</svg>",
                Current: "<svg>current</svg>",
            });
            expect(importer.getCurrentConfigurationForExport()).toEqual({
                name: "current",
                actors: {},
                workObjects: { Current: "<svg>current</svg>" },
            });
        });

        it("is stable across repeated identical imports", () => {
            const port = new RecordingStyleSheetPort();
            const service = new IconDictionaryService(port);
            const imported = iconSet(
                { Person: "<svg>person</svg>" },
                { Document: "<svg>document</svg>" },
            );

            service.updateIconRegistries(imported);
            service.updateIconRegistries(imported);

            expect(service.getFullDictionary().toRecord()).toEqual({
                Person: "<svg>person</svg>",
                Document: "<svg>document</svg>",
            });
            expect(port.calls).toHaveLength(4);
            expect(port.calls.slice(0, 2)).toEqual(port.calls.slice(2));
        });

        it("uses the actor value when categories share an icon name", () => {
            const port = new RecordingStyleSheetPort();
            const service = new IconDictionaryService(port);

            service.updateIconRegistries(
                iconSet(
                    { Shared: "<svg>actor</svg>" },
                    { Shared: "<svg>work-object</svg>" },
                ),
            );

            expect(service.getIconSource("Shared")).toBe("<svg>actor</svg>");
            expect(port.calls).toEqual([
                [service.getCSSClassOfIcon("Shared"), "<svg>actor</svg>"],
            ]);
            expect(service.getActorsDictionary().get("Shared")).toBe(
                "<svg>actor</svg>",
            );
            expect(service.getWorkObjectsDictionary().get("Shared")).toBe(
                "<svg>work-object</svg>",
            );
        });
    });

    describe("type validation", () => {
        it.each(["register", "unregister"])(
            "throws before mutating dictionaries on unsupported %s",
            (operation) => {
                const service = new IconDictionaryService(
                    new RecordingStyleSheetPort(),
                );
                service.updateIconRegistries(
                    iconSet(
                        { Person: "<svg>person</svg>" },
                        { Document: "<svg>document</svg>" },
                    ),
                );
                const actorsBefore = service.getActorsDictionary().toRecord();
                const workObjectsBefore = service
                    .getWorkObjectsDictionary()
                    .toRecord();

                expect(() => {
                    if (operation === "register") {
                        service.registerIconForType(
                            ElementTypes.ACTIVITY,
                            "Invalid",
                            "<svg/>",
                        );
                    } else {
                        service.unregisterIconForType(
                            ElementTypes.ACTIVITY,
                            "Person",
                        );
                    }
                }).toThrow("Unsupported icon element type");
                expect(service.getActorsDictionary().toRecord()).toEqual(
                    actorsBefore,
                );
                expect(service.getWorkObjectsDictionary().toRecord()).toEqual(
                    workObjectsBefore,
                );
            },
        );

        it("keeps unsupported read-only lookup behavior", () => {
            const service = new IconDictionaryService(
                new RecordingStyleSheetPort(),
            );

            expect(
                service.getIconsAssignedAs(ElementTypes.ACTIVITY).toRecord(),
            ).toEqual({});
        });
    });
});
