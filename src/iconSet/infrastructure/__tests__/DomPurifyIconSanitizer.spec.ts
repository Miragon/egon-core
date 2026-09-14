import { beforeEach, describe, expect, it } from "vitest";

import {
    decodeUtf8Base64,
    UNICODE_ICON_CONTENT,
    UNICODE_ICON_GEOMETRY,
    unicodeIconSource,
    type SvgRepresentation,
} from "../../../__tests__/fixtures/unicodeIcons";
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
    return decodeUtf8Base64(dataUrl.split(",")[1]);
}

function expectUnicodeIcon(svg: string): SVGSVGElement {
    const root = parse(svg);
    expect(root.querySelector("title")?.textContent).toBe(
        UNICODE_ICON_CONTENT.title,
    );
    expect(root.querySelector("desc")?.textContent).toBe(
        UNICODE_ICON_CONTENT.description,
    );
    expect(root.querySelector("text")?.childNodes[0]?.textContent).toBe(
        UNICODE_ICON_CONTENT.text,
    );
    expect(root.querySelector("tspan")?.textContent).toBe(
        UNICODE_ICON_CONTENT.tspan,
    );
    expect(root.querySelector("textPath")?.textContent).toBe(
        UNICODE_ICON_CONTENT.textPath,
    );
    expect(root.getAttribute("aria-label")).toBe(
        UNICODE_ICON_CONTENT.ariaLabel,
    );
    expect(root.getAttribute("data-label")).toBe(
        UNICODE_ICON_CONTENT.dataLabel,
    );
    expect(root.getAttribute("viewBox")).toBe(UNICODE_ICON_GEOMETRY.viewBox);
    expect(
        root.querySelector('[data-geometry="solid"]')?.getAttribute("d"),
    ).toBe(UNICODE_ICON_GEOMETRY.rect);
    return root;
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

    it.each<SvgRepresentation>(["raw", "base64", "percent"])(
        "preserves Unicode while normalizing %s SVG repeatedly",
        (representation) => {
            const safe = sanitizer.sanitize(unicodeIconSource(representation));
            const svg = safe.startsWith("data:")
                ? decodeSvgDataUrl(safe)
                : safe;

            expectUnicodeIcon(svg);
            expect(sanitizer.sanitize(safe)).toBe(safe);
        },
    );

    it.each<SvgRepresentation>(["raw", "base64", "percent"])(
        "recolors %s SVG without changing its Unicode or geometry",
        (representation) => {
            const rendered = sanitizer.prepareForRendering(
                unicodeIconSource(representation),
                "#7a21c4",
            );
            const renderedRoot = parse(rendered);
            let artworkRoot = renderedRoot;

            if (representation !== "raw") {
                const href = renderedRoot
                    .querySelector("image")
                    ?.getAttribute("href");
                expect(href).toMatch(/^data:image\/svg\+xml;base64,/);
                artworkRoot = expectUnicodeIcon(decodeSvgDataUrl(href!));
            } else {
                expectUnicodeIcon(rendered);
            }

            expect(
                artworkRoot
                    .querySelector('[data-geometry="solid"]')
                    ?.getAttribute("fill"),
            ).toBe("#7a21c4");
        },
    );

    it("rejects Base64 whose decoded SVG bytes are malformed UTF-8", () => {
        const invalidUtf8 = Uint8Array.of(
            ...new TextEncoder().encode(`<svg xmlns="${SVG_NS}"><text>`),
            0xc3,
            0x28,
            ...new TextEncoder().encode("</text></svg>"),
        );
        let binary = "";
        for (const byte of invalidUtf8) binary += String.fromCharCode(byte);

        expect(
            sanitizer.sanitize(`data:image/svg+xml;base64,${btoa(binary)}`),
        ).toBe(INERT_ICON_SVG);
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
