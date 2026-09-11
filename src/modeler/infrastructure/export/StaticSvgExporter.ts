import type Canvas from "diagram-js/lib/core/Canvas";

import type { DomainStoryDocument } from "../../../story/domain/DomainStoryDocument";
import type {
    SvgExportOptions,
    SvgExportResult,
} from "../../domain/export/VisualExport";

const SVG_NS = "http://www.w3.org/2000/svg";
const DEFAULT_PADDING = 20;
const MIN_CONTENT_SIZE = 1;

/** Creates a standalone SVG from a clean, captured editor session. */
export function exportStaticSvg(
    canvas: Canvas,
    document: DomainStoryDocument,
    options: SvgExportOptions = {},
): SvgExportResult {
    const padding = validPadding(options.padding);
    const layer = canvas.getActiveLayer();
    if (!layer)
        throw new Error("Cannot export SVG without an active canvas layer");

    let measured: DOMRect | SVGRect;
    try {
        measured = (layer as unknown as SVGGraphicsElement).getBBox();
    } catch (error) {
        const measurementError = new Error("Could not measure diagram content");
        (measurementError as Error & { cause?: unknown }).cause = error;
        throw measurementError;
    }

    const contentWidth = Math.max(MIN_CONTENT_SIZE, measured.width || 0);
    const contentHeight = Math.max(MIN_CONTENT_SIZE, measured.height || 0);
    const heading = createHeading(document, options, measured.x, measured.y);
    const sourceSvg = canvas.getContainer().querySelector("svg");
    if (heading && sourceSvg) measureHeading(heading, sourceSvg);
    const minX = Math.min(measured.x, heading?.x ?? measured.x) - padding;
    const minY = Math.min(measured.y, heading?.top ?? measured.y) - padding;
    const maxX =
        Math.max(
            measured.x + contentWidth,
            (heading?.x ?? measured.x) + (heading?.width ?? 0),
        ) + padding;
    const maxY = measured.y + contentHeight + padding;
    const width = Math.max(MIN_CONTENT_SIZE, maxX - minX);
    const height = Math.max(MIN_CONTENT_SIZE, maxY - minY);

    const svg = documentNode("svg") as SVGSVGElement;
    svg.setAttribute("xmlns", SVG_NS);
    svg.setAttribute("version", "1.1");
    svg.setAttribute("width", formatNumber(width));
    svg.setAttribute("height", formatNumber(height));
    svg.setAttribute(
        "viewBox",
        [minX, minY, width, height].map(formatNumber).join(" "),
    );

    if (options.background) {
        const background = documentNode("rect");
        background.setAttribute("x", formatNumber(minX));
        background.setAttribute("y", formatNumber(minY));
        background.setAttribute("width", formatNumber(width));
        background.setAttribute("height", formatNumber(height));
        background.setAttribute("fill", options.background);
        background.setAttribute("data-egon-export-background", "");
        svg.appendChild(background);
    }

    const defs = sourceSvg?.querySelector(":scope > defs");
    if (defs) svg.appendChild(defs.cloneNode(true));
    if (heading) svg.appendChild(heading.node);

    const content = (layer as unknown as SVGElement).cloneNode(
        true,
    ) as SVGElement;
    cleanExportedContent(content);
    svg.appendChild(content);

    let serialized = new XMLSerializer().serializeToString(svg);
    if (options.embedDocument ?? true) {
        serialized = appendEmbeddedDocument(serialized, document);
    }

    return {
        svg: `<?xml version="1.0" encoding="utf-8"?>\n${serialized}`,
        width,
        height,
    };
}

function measureHeading(
    heading: { node: SVGElement; x: number; top: number; width: number },
    sourceSvg: SVGSVGElement,
): void {
    sourceSvg.appendChild(heading.node);
    try {
        const bounds = (heading.node as SVGGraphicsElement).getBBox();
        heading.x = bounds.x;
        heading.top = bounds.y;
        heading.width = bounds.width;
    } finally {
        heading.node.remove();
    }
}

function createHeading(
    storyDocument: DomainStoryDocument,
    options: SvgExportOptions,
    x: number,
    contentY: number,
): { node: SVGElement; x: number; top: number; width: number } | undefined {
    const lines: { text: string; size: number; weight?: string }[] = [];
    if (options.includeTitle) {
        lines.push({
            text: storyDocument.domainStory.title,
            size: 20,
            weight: "bold",
        });
    }
    if (options.includeDescription) {
        storyDocument.domainStory.description
            .split(/\r?\n/)
            .forEach((text) => lines.push({ text, size: 12 }));
    }
    if (lines.length === 0) return;

    const lineGap = 6;
    const totalHeight = lines.reduce(
        (height, line) => height + line.size + lineGap,
        0,
    );
    const top = contentY - totalHeight;
    const text = documentNode("text");
    text.setAttribute("x", formatNumber(x));
    text.setAttribute("y", formatNumber(top));
    text.setAttribute("font-family", "Arial, sans-serif");
    text.setAttribute("fill", "black");
    text.setAttribute("data-egon-export-heading", "");

    let dy = 0;
    let approximateWidth = 0;
    lines.forEach((line, index) => {
        const span = documentNode("tspan");
        span.setAttribute("x", formatNumber(x));
        span.setAttribute("dy", formatNumber(index === 0 ? line.size : dy));
        span.setAttribute("font-size", String(line.size));
        if (line.weight) span.setAttribute("font-weight", line.weight);
        span.textContent = line.text;
        text.appendChild(span);
        dy = line.size + lineGap;
        approximateWidth = Math.max(
            approximateWidth,
            line.text.length * line.size * 0.65,
        );
    });

    return { node: text, x, top, width: approximateWidth };
}

function cleanExportedContent(content: SVGElement): void {
    content
        .querySelectorAll(
            ".djs-hit, .djs-outline, .djs-resizer, .djs-segment-dragger, .djs-bendpoint",
        )
        .forEach((node) => node.remove());
    [content, ...Array.from(content.querySelectorAll("*"))].forEach((node) => {
        node.classList.remove(
            "selected",
            "hover",
            "djs-element-hidden",
            "egon-replay-hidden",
            "egon-replay-current",
        );
        node.removeAttribute("data-egon-color-preview");
    });
    content.removeAttribute("transform");
}

/**
 * WPS scans raw SVG text, applies its legacy decoder, then JSON.parse(). Escape
 * characters that decoder/XML entities could reinterpret inside JSON strings;
 * JSON's unicode escapes restore the exact value after parsing.
 */
function appendEmbeddedDocument(
    svg: string,
    storyDocument: DomainStoryDocument,
): string {
    const json = JSON.stringify(storyDocument, null, 2)
        .replaceAll("%", "\\u0025")
        .replaceAll("&", "\\u0026")
        .replaceAll("<", "\\u003c")
        .replaceAll(">", "\\u003e")
        .replaceAll("–", "\\u2013");
    const hidden =
        '<text class="hiddenDomainStory" style="font-size: 0">\n\n' +
        `%3CDST%3E${json}%3C/DST%3E` +
        "\n\n</text>\n";
    return svg.replace(/<\/svg>\s*$/, `${hidden}</svg>`);
}

function documentNode(name: string): SVGElement {
    return document.createElementNS(SVG_NS, name);
}

function validPadding(value: number | undefined): number {
    const padding = value ?? DEFAULT_PADDING;
    if (!Number.isFinite(padding) || padding < 0) {
        throw new RangeError(
            "Export padding must be a finite non-negative number",
        );
    }
    return padding;
}

function formatNumber(value: number): string {
    return String(Math.round(value * 1000) / 1000);
}
