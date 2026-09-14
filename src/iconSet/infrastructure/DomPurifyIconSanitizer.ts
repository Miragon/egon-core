import createDOMPurify, { type DOMPurify } from "dompurify";

import type { IconSanitizerPort } from "../domain/ports/IconSanitizerPort";

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
const XLINK_NAMESPACE = "http://www.w3.org/1999/xlink";

/** Stable neutral replacement for malformed icons and artwork removed in full. */
export const INERT_ICON_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"></svg>';

const FORBIDDEN_TAGS = [
    "script",
    "style",
    "foreignObject",
    "animate",
    "animateColor",
    "animateMotion",
    "animateTransform",
    "discard",
    "set",
];

const DRAWABLE_TAGS: readonly string[] = [
    "circle",
    "ellipse",
    "image",
    "line",
    "path",
    "polygon",
    "polyline",
    "rect",
    "text",
    "textPath",
    "use",
];

/**
 * Inline CSS is intentionally narrower than DOMPurify's SVG profile. Only
 * static presentation properties are retained; layout/external-resource CSS
 * and custom properties are discarded.
 */
const ALLOWED_STYLE_PROPERTIES: readonly string[] = [
    "alignment-baseline",
    "baseline-shift",
    "clip-path",
    "clip-rule",
    "color",
    "color-interpolation",
    "color-interpolation-filters",
    "color-rendering",
    "display",
    "dominant-baseline",
    "fill",
    "fill-opacity",
    "fill-rule",
    "filter",
    "flood-color",
    "flood-opacity",
    "font-family",
    "font-size",
    "font-style",
    "font-weight",
    "image-rendering",
    "letter-spacing",
    "lighting-color",
    "marker-end",
    "marker-mid",
    "marker-start",
    "mask",
    "opacity",
    "overflow",
    "paint-order",
    "pointer-events",
    "shape-rendering",
    "stop-color",
    "stop-opacity",
    "stroke",
    "stroke-dasharray",
    "stroke-dashoffset",
    "stroke-linecap",
    "stroke-linejoin",
    "stroke-miterlimit",
    "stroke-opacity",
    "stroke-width",
    "text-anchor",
    "text-decoration",
    "text-rendering",
    "transform",
    "transform-origin",
    "vector-effect",
    "visibility",
    "word-spacing",
    "writing-mode",
];

const LOCAL_URL_PROPERTIES: readonly string[] = [
    "clip-path",
    "fill",
    "filter",
    "marker-end",
    "marker-mid",
    "marker-start",
    "mask",
    "stroke",
];

const VALIDATED_PRESENTATION_ATTRIBUTES: readonly string[] = [
    "color",
    "fill",
    "flood-color",
    "lighting-color",
    "stop-color",
    "stroke",
];

const LOCAL_FRAGMENT = /^#[A-Za-z_][A-Za-z0-9_.:-]*$/;
const LOCAL_URL = /^url\(\s*["']?(#[A-Za-z_][A-Za-z0-9_.:-]*)["']?\s*\)$/i;
const UNSAFE_CSS_VALUE =
    /(?:javascript\s*:|data\s*:|@import|expression\s*\(|(?:var|env|paint)\s*\(|-moz-binding|behavior\s*:)/i;
const URL_FUNCTION = /url\s*\(/i;

const NON_RENDERING_CONTAINERS: readonly string[] = [
    "clipPath",
    "defs",
    "filter",
    "linearGradient",
    "marker",
    "mask",
    "pattern",
    "radialGradient",
    "symbol",
];

type RasterMime = "image/png" | "image/jpeg" | "image/gif" | "image/webp";

interface ParsedDataUrl {
    mime: string;
    base64: boolean;
    payload: string;
}

/**
 * Browser infrastructure adapter implementing the static-SVG policy in ADR
 * 0023. Each didi injector constructs its own instance, including its own
 * DOMPurify object and hooks/configuration state.
 */
export class DomPurifyIconSanitizer implements IconSanitizerPort {
    static $inject: string[] = [];

    private readonly purifier: DOMPurify;
    private readonly parser = new DOMParser();
    private readonly serializer = new XMLSerializer();

    constructor() {
        this.purifier = createDOMPurify(window);
    }

    sanitize(source: string): string {
        if (typeof source !== "string") {
            return INERT_ICON_SVG;
        }

        const trimmed = source.trim();
        if (trimmed.toLowerCase().startsWith("data:")) {
            return this.sanitizeDataUrl(trimmed, 0) ?? INERT_ICON_SVG;
        }
        return this.sanitizeSvg(trimmed, 0);
    }

    prepareForRendering(source: string, color: string): string {
        const safeSource = this.sanitize(source);
        let rendered: string;

        if (safeSource.toLowerCase().startsWith("data:")) {
            const parsed = this.parseDataUrl(safeSource);
            if (parsed?.mime === "image/svg+xml") {
                const decoded = this.decodeSvgDataUrl(parsed);
                const colored = decoded
                    ? this.applyColor(decoded, color)
                    : INERT_ICON_SVG;
                rendered = this.wrapDataUrl(this.encodeSvgDataUrl(colored));
            } else {
                rendered = this.wrapDataUrl(safeSource);
            }
        } else {
            rendered = this.applyColor(safeSource, color);
        }

        // Deliberately last: recolouring and data-URL wrapping happen before
        // this pass, so neither transformation can bypass the storage policy.
        return this.sanitizeSvg(rendered, 0);
    }

    private sanitizeSvg(source: string, depth: number): string {
        if (
            !source ||
            depth > 3 ||
            /<!DOCTYPE|<\?xml-stylesheet/i.test(source)
        ) {
            return INERT_ICON_SVG;
        }

        if (!this.parseSvg(source)) {
            return INERT_ICON_SVG;
        }

        const purified = this.purifier.sanitize(source, {
            USE_PROFILES: { svg: true, svgFilters: true },
            NAMESPACE: SVG_NAMESPACE,
            ALLOW_ARIA_ATTR: true,
            ALLOW_DATA_ATTR: true,
            ALLOW_UNKNOWN_PROTOCOLS: false,
            ADD_TAGS: ["use"],
            ADD_DATA_URI_TAGS: ["image"],
            ADD_ATTR: ["href", "xlink:href"],
            FORBID_TAGS: FORBIDDEN_TAGS,
            FORBID_CONTENTS: ["script", "style", "foreignObject"],
            KEEP_CONTENT: false,
            RETURN_TRUSTED_TYPE: false,
        });

        const document = this.parseSvg(String(purified));
        if (!document) {
            return INERT_ICON_SVG;
        }

        const root = document.documentElement as unknown as SVGSVGElement;
        this.applyAttributePolicy(root, depth);

        if (!this.hasDrawableArtwork(root)) {
            return INERT_ICON_SVG;
        }

        return this.serializer.serializeToString(root);
    }

    private parseSvg(source: string): XMLDocument | undefined {
        let parsed = this.parser.parseFromString(source, "image/svg+xml");
        if (
            parsed.querySelector("parsererror") ||
            parsed.documentElement.localName !== "svg"
        ) {
            return undefined;
        }

        // Standalone snippets commonly omit xmlns. They are unambiguously SVG
        // at this API boundary; normalize the root through the XML serializer
        // so the root and all unprefixed descendants acquire the SVG namespace.
        if (parsed.documentElement.namespaceURI === null) {
            parsed.documentElement.setAttribute("xmlns", SVG_NAMESPACE);
            parsed = this.parser.parseFromString(
                this.serializer.serializeToString(parsed.documentElement),
                "image/svg+xml",
            );
        }
        if (parsed.documentElement.namespaceURI !== SVG_NAMESPACE) {
            return undefined;
        }
        return parsed;
    }

    private applyAttributePolicy(root: SVGSVGElement, depth: number): void {
        const elements = [root, ...Array.from(root.querySelectorAll("*"))];

        for (const element of elements) {
            for (const attribute of Array.from(element.attributes)) {
                const name = attribute.localName.toLowerCase();

                if (name.startsWith("on")) {
                    element.removeAttributeNode(attribute);
                    continue;
                }

                if (name === "style") {
                    this.sanitizeStyle(element as SVGElement, attribute.value);
                    continue;
                }

                if (name === "href") {
                    this.sanitizeHref(element, attribute, depth);
                    continue;
                }

                if (URL_FUNCTION.test(attribute.value)) {
                    const url = attribute.value.match(LOCAL_URL);
                    if (!url || !LOCAL_URL_PROPERTIES.includes(name)) {
                        element.removeAttributeNode(attribute);
                    } else {
                        element.setAttributeNS(
                            attribute.namespaceURI,
                            attribute.name,
                            `url(${url[1]})`,
                        );
                    }
                    continue;
                }

                if (
                    VALIDATED_PRESENTATION_ATTRIBUTES.includes(name) &&
                    !this.isValidPresentationAttribute(name, attribute.value)
                ) {
                    element.removeAttributeNode(attribute);
                }
            }
        }
    }

    private sanitizeHref(
        element: Element,
        attribute: Attr,
        depth: number,
    ): void {
        const value = attribute.value.trim();
        let safeValue: string | undefined;

        if (LOCAL_FRAGMENT.test(value)) {
            safeValue = value;
        } else if (element.localName === "image") {
            safeValue = this.sanitizeDataUrl(value, depth + 1);
        }

        element.removeAttributeNode(attribute);
        if (!safeValue) {
            return;
        }

        if (attribute.namespaceURI === XLINK_NAMESPACE) {
            element.setAttributeNS(XLINK_NAMESPACE, "xlink:href", safeValue);
        } else {
            element.setAttribute("href", safeValue);
        }
    }

    private sanitizeStyle(element: SVGElement, source: string): void {
        const parserElement = document.createElementNS(SVG_NAMESPACE, "g");
        parserElement.setAttribute("style", source);
        const safeDeclarations: Array<[string, string, string]> = [];

        for (let index = 0; index < parserElement.style.length; index++) {
            const property = parserElement.style.item(index).toLowerCase();
            const value = parserElement.style.getPropertyValue(property).trim();
            const priority = parserElement.style.getPropertyPriority(property);

            if (
                ALLOWED_STYLE_PROPERTIES.includes(property) &&
                this.isSafeStyleValue(property, value)
            ) {
                safeDeclarations.push([property, value, priority]);
            }
        }

        element.removeAttribute("style");
        for (const [property, value, priority] of safeDeclarations) {
            element.style.setProperty(property, value, priority);
        }
        if (element.style.length === 0) {
            element.removeAttribute("style");
        }
    }

    private isSafeStyleValue(property: string, value: string): boolean {
        if (!value || UNSAFE_CSS_VALUE.test(value)) {
            return false;
        }
        if (!URL_FUNCTION.test(value)) {
            return (
                !VALIDATED_PRESENTATION_ATTRIBUTES.includes(property) ||
                this.isValidPresentationAttribute(property, value)
            );
        }
        return LOCAL_URL_PROPERTIES.includes(property) && LOCAL_URL.test(value);
    }

    private isValidPresentationAttribute(
        property: string,
        value: string,
    ): boolean {
        if (
            UNSAFE_CSS_VALUE.test(value) ||
            /["'<>;{}\\]/.test(value) ||
            Array.from(value).some((character) => {
                const code = character.charCodeAt(0);
                return code <= 0x1f || code === 0x7f;
            })
        ) {
            return false;
        }
        const probe = document.createElementNS(SVG_NAMESPACE, "g");
        probe.style.setProperty(property, value);
        return probe.style.getPropertyValue(property) !== "";
    }

    private hasDrawableArtwork(root: SVGSVGElement): boolean {
        const rootElement = root as unknown as Element;
        return Array.from(root.querySelectorAll("*")).some((element) => {
            if (!DRAWABLE_TAGS.includes(element.localName)) {
                return false;
            }
            if (
                (element.localName === "image" ||
                    element.localName === "use") &&
                !element.hasAttribute("href") &&
                !element.hasAttributeNS(XLINK_NAMESPACE, "href")
            ) {
                return false;
            }

            let parent = element.parentElement;
            while (parent && parent !== rootElement) {
                if (NON_RENDERING_CONTAINERS.includes(parent.localName)) {
                    return false;
                }
                parent = parent.parentElement;
            }
            return true;
        });
    }

    private sanitizeDataUrl(source: string, depth: number): string | undefined {
        if (depth > 3) {
            return undefined;
        }
        const parsed = this.parseDataUrl(source);
        if (!parsed) {
            return undefined;
        }

        if (parsed.mime === "image/svg+xml") {
            const decoded = this.decodeSvgDataUrl(parsed);
            if (!decoded) {
                return undefined;
            }
            return this.encodeSvgDataUrl(this.sanitizeSvg(decoded, depth));
        }

        if (!parsed.base64 || !this.isValidBase64(parsed.payload)) {
            return undefined;
        }

        const bytes = this.decodeBase64(parsed.payload);
        if (!bytes || !this.hasRasterSignature(parsed.mime, bytes)) {
            return undefined;
        }
        return `data:${parsed.mime};base64,${parsed.payload}`;
    }

    private parseDataUrl(source: string): ParsedDataUrl | undefined {
        const match = /^data:([^,]*),([\s\S]*)$/i.exec(source);
        if (!match) {
            return undefined;
        }

        const metadata = match[1].split(";");
        const mime = metadata.shift()?.toLowerCase() ?? "";
        const parameters = metadata.map((part) => part.toLowerCase());
        const base64 = parameters.at(-1) === "base64";
        const nonEncodingParameters = base64
            ? parameters.slice(0, -1)
            : parameters;

        if (mime === "image/svg+xml") {
            if (
                nonEncodingParameters.some(
                    (parameter) =>
                        parameter !== "utf8" &&
                        !/^charset=[a-z0-9._-]+$/i.test(parameter),
                )
            ) {
                return undefined;
            }
        } else if (
            !(
                [
                    "image/png",
                    "image/jpeg",
                    "image/gif",
                    "image/webp",
                ] as string[]
            ).includes(mime) ||
            nonEncodingParameters.length > 0
        ) {
            return undefined;
        }

        return { mime, base64, payload: match[2] };
    }

    private decodeSvgDataUrl(parsed: ParsedDataUrl): string | undefined {
        try {
            if (!parsed.base64) {
                return decodeURIComponent(parsed.payload);
            }
            if (!this.isValidBase64(parsed.payload)) {
                return undefined;
            }
            const bytes = this.decodeBase64(parsed.payload);
            return bytes
                ? new TextDecoder("utf-8", { fatal: true }).decode(bytes)
                : undefined;
        } catch {
            return undefined;
        }
    }

    private encodeSvgDataUrl(svg: string): string {
        const bytes = new TextEncoder().encode(svg);
        let binary = "";
        for (const byte of bytes) {
            binary += String.fromCharCode(byte);
        }
        return `data:image/svg+xml;base64,${btoa(binary)}`;
    }

    private isValidBase64(payload: string): boolean {
        return (
            payload.length > 0 &&
            payload.length % 4 === 0 &&
            /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
                payload,
            )
        );
    }

    private decodeBase64(payload: string): Uint8Array | undefined {
        try {
            const binary = atob(payload);
            return Uint8Array.from(binary, (character) =>
                character.charCodeAt(0),
            );
        } catch {
            return undefined;
        }
    }

    private hasRasterSignature(mime: string, bytes: Uint8Array): boolean {
        const startsWith = (...signature: number[]) =>
            signature.every((byte, index) => bytes[index] === byte);

        switch (mime as RasterMime) {
            case "image/png":
                return startsWith(
                    0x89,
                    0x50,
                    0x4e,
                    0x47,
                    0x0d,
                    0x0a,
                    0x1a,
                    0x0a,
                );
            case "image/jpeg":
                return startsWith(0xff, 0xd8, 0xff);
            case "image/gif":
                return (
                    startsWith(0x47, 0x49, 0x46, 0x38, 0x37, 0x61) ||
                    startsWith(0x47, 0x49, 0x46, 0x38, 0x39, 0x61)
                );
            case "image/webp":
                return (
                    startsWith(0x52, 0x49, 0x46, 0x46) &&
                    bytes[8] === 0x57 &&
                    bytes[9] === 0x45 &&
                    bytes[10] === 0x42 &&
                    bytes[11] === 0x50
                );
            default:
                return false;
        }
    }

    private applyColor(svg: string, color: string): string {
        const parsed = this.parseSvg(svg);
        if (!parsed) {
            return INERT_ICON_SVG;
        }

        const elements = [
            parsed.documentElement,
            ...Array.from(parsed.documentElement.querySelectorAll("*")),
        ];
        const painted = elements.filter((element) => {
            const attributeFill = element.getAttribute("fill");
            const styleFill = (element as SVGElement).style?.fill;
            return (
                (attributeFill !== null && attributeFill !== "none") ||
                (styleFill && styleFill !== "none")
            );
        });

        if (painted.length === 0) {
            parsed.documentElement.setAttribute("fill", color);
        } else {
            for (const element of painted) {
                if (element.hasAttribute("fill")) {
                    element.setAttribute("fill", color);
                }
                const svgElement = element as SVGElement;
                if (
                    svgElement.style?.fill &&
                    svgElement.style.fill !== "none"
                ) {
                    svgElement.style.setProperty("fill", color);
                }
            }
        }

        return this.serializer.serializeToString(parsed.documentElement);
    }

    private wrapDataUrl(dataUrl: string): string {
        const svg = document.createElementNS(SVG_NAMESPACE, "svg");
        svg.setAttribute("viewBox", "0 0 24 24");
        svg.setAttribute("width", "48");
        svg.setAttribute("height", "48");

        const image = document.createElementNS(SVG_NAMESPACE, "image");
        image.setAttribute("width", "24");
        image.setAttribute("height", "24");
        image.setAttribute("href", dataUrl);
        svg.appendChild(image);

        return this.serializer.serializeToString(svg);
    }
}
