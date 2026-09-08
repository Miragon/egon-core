import { beforeEach, describe, expect, it } from "vitest";

import {
    DomPurifyIconSanitizer,
    INERT_ICON_SVG,
} from "../DomPurifyIconSanitizer";

const SVG_NS = "http://www.w3.org/2000/svg";
const PNG_1PX =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

function parse(svg: string): SVGSVGElement {
    const document = new DOMParser().parseFromString(svg, "image/svg+xml");
    return document.documentElement as unknown as SVGSVGElement;
}

function decodeSvgDataUrl(dataUrl: string): string {
    return new TextDecoder().decode(
        Uint8Array.from(atob(dataUrl.split(",")[1]), (character) =>
            character.charCodeAt(0),
        ),
    );
}

describe("DomPurifyIconSanitizer", () => {
    let sanitizer: DomPurifyIconSanitizer;

    beforeEach(() => {
        sanitizer = new DomPurifyIconSanitizer();
    });

    it("preserves static SVG artwork, local references, and allowed presentation styles", () => {
        const safe = sanitizer.sanitize(`
            <svg xmlns="${SVG_NS}" viewBox="0 0 24 24">
              <defs>
                <linearGradient id="paint"><stop offset="0" style="stop-color:#fff;stop-opacity:.5;position:fixed"/></linearGradient>
                <clipPath id="clip"><rect width="12" height="12"/></clipPath>
                <mask id="fade"><rect width="24" height="24" fill="white"/></mask>
                <path id="reused" d="M1 1h2v2z"/>
              </defs>
              <g transform="translate(1 2)" style="fill:url(#paint);stroke:#123;background-image:url(https://example.test/x)">
                <path d="M0 0h20v20z" clip-path="url(#clip)" mask="url(#fade)"/>
                <use href="#reused"/>
                <text x="2" y="10">hello</text>
              </g>
            </svg>
        `);
        const root = parse(safe);

        expect(root.getAttribute("viewBox")).toBe("0 0 24 24");
        expect(root.querySelector("linearGradient")).not.toBeNull();
        expect(root.querySelector("clipPath")).not.toBeNull();
        expect(root.querySelector("mask")).not.toBeNull();
        expect(root.querySelector("g")?.getAttribute("transform")).toBe(
            "translate(1 2)",
        );
        expect(root.querySelector("g")?.style.fill).toContain("#paint");
        expect(root.querySelector("g")?.style.stroke).toBe("#123");
        expect(root.querySelector("g")?.style.position).toBe("");
        expect(root.querySelector("g")?.style.backgroundImage).toBe("");
        expect(
            root.querySelector("path[clip-path]")?.getAttribute("clip-path"),
        ).toBe("url(#clip)");
        expect(root.querySelector("use")?.getAttribute("href")).toBe("#reused");
        expect(root.querySelector("text")?.textContent).toBe("hello");
        expect(sanitizer.sanitize(safe)).toBe(safe);
    });

    it("removes active content, external URLs, animation, and embedded stylesheets", () => {
        const safe = sanitizer.sanitize(`
            <svg xmlns="${SVG_NS}" onload="window.__egonExecuted = true">
              <script>window.__egonExecuted = true</script>
              <style>@import url(https://example.test/x); path { fill: red }</style>
              <foreignObject><div xmlns="http://www.w3.org/1999/xhtml">active html</div></foreignObject>
              <animate attributeName="x" values="0;1"/>
              <a href="https://example.test"><path d="M0 0h1v1z"/></a>
              <image href="javascript:window.__egonExecuted=true"/>
              <path d="M0 0h20v20z" fill="url(https://example.test/paint)" style="filter:url(https://example.test/filter);fill:red" onclick="window.__egonExecuted=true"/>
            </svg>
        `);
        const root = parse(safe);

        expect(
            root.querySelector("script,style,foreignObject,animate"),
        ).toBeNull();
        expect(root.querySelector("div")).toBeNull();
        expect(root.querySelector("a")?.hasAttribute("href")).toBe(false);
        expect(root.querySelector("image")?.hasAttribute("href")).toBe(false);
        expect(root.querySelector("path")?.hasAttribute("onclick")).toBe(false);
        expect(root.querySelector("path")?.hasAttribute("fill")).toBe(false);
        const styledPath = root.querySelector<SVGPathElement>("path[style]");
        expect(styledPath?.style.filter).toBe("");
        expect(styledPath?.style.fill).toBe("red");
    });

    it("decodes and sanitizes SVG data URLs before re-encoding them", () => {
        const unsafeSvg = `<svg xmlns="${SVG_NS}" onload="window.__egonExecuted=true"><script>window.__egonExecuted=true</script><circle cx="5" cy="5" r="5"/></svg>`;
        const dataUrl = `data:image/svg+xml;base64,${btoa(unsafeSvg)}`;

        const safe = sanitizer.sanitize(dataUrl);
        const decoded = decodeSvgDataUrl(safe);

        expect(safe).toMatch(/^data:image\/svg\+xml;base64,/);
        expect(decoded).toContain("<circle");
        expect(decoded).not.toMatch(/onload|script|__egonExecuted/);
        expect(sanitizer.sanitize(safe)).toBe(safe);

        const percentEncoded = sanitizer.sanitize(
            `data:image/svg+xml;utf8,${encodeURIComponent(unsafeSvg)}`,
        );
        expect(percentEncoded).toMatch(/^data:image\/svg\+xml;base64,/);
        expect(decodeSvgDataUrl(percentEncoded)).not.toMatch(/onload|script/);
    });

    it("retains supported raster data and rejects malformed or disguised payloads", () => {
        const png = `data:image/png;base64,${PNG_1PX}`;

        expect(sanitizer.sanitize(png)).toBe(png);
        expect(sanitizer.sanitize("data:image/png;base64,not-base64")).toBe(
            INERT_ICON_SVG,
        );
        expect(
            sanitizer.sanitize(`data:image/png;base64,${btoa("<svg/>")}`),
        ).toBe(INERT_ICON_SVG);
        expect(sanitizer.sanitize("data:text/html;base64,PHNjcmlwdD4=")).toBe(
            INERT_ICON_SVG,
        );
    });

    it("uses an inert, idempotent fallback for malformed or removed artwork", () => {
        expect(sanitizer.sanitize("<svg><path></svg>")).toBe(INERT_ICON_SVG);
        expect(
            sanitizer.sanitize(
                `<svg xmlns="${SVG_NS}"><script>alert(1)</script></svg>`,
            ),
        ).toBe(INERT_ICON_SVG);
        expect(
            sanitizer.sanitize(
                `<svg xmlns="${SVG_NS}"><defs><path id="unused" d="M0 0h1v1z"/></defs></svg>`,
            ),
        ).toBe(INERT_ICON_SVG);
        expect(
            sanitizer.sanitize(
                `<svg xmlns="${SVG_NS}"><image href="https://example.test/x.png"/></svg>`,
            ),
        ).toBe(INERT_ICON_SVG);
        expect(sanitizer.sanitize(INERT_ICON_SVG)).toBe(INERT_ICON_SVG);
    });

    it("normalizes safe standalone SVG snippets that omit xmlns", () => {
        const safe = sanitizer.sanitize('<svg><path d="M0 0h1v1z"/></svg>');

        expect(parse(safe).namespaceURI).toBe(SVG_NS);
        expect(parse(safe).querySelector("path")?.namespaceURI).toBe(SVG_NS);
    });

    it("sanitizes again after DOM-based recoloring and data-URL wrapping", () => {
        const unsafe = `<svg xmlns="${SVG_NS}" onload="window.__egonExecuted=true"><path d="M0 0h20v20z" fill="red"/></svg>`;
        const rendered = sanitizer.prepareForRendering(
            unsafe,
            `red" onload="window.__egonExecuted=true`,
        );
        const root = parse(rendered);

        expect(root.hasAttribute("onload")).toBe(false);
        expect(root.querySelector("script")).toBeNull();
        expect(root.querySelector("path")?.hasAttribute("onload")).toBe(false);
        expect(root.querySelector("path")?.hasAttribute("fill")).toBe(false);

        const raster = sanitizer.prepareForRendering(
            `data:image/png;base64,${PNG_1PX}`,
            "#000",
        );
        expect(parse(raster).querySelector("image")?.getAttribute("href")).toBe(
            `data:image/png;base64,${PNG_1PX}`,
        );
    });
});
