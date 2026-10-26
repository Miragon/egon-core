import type { Element } from "diagram-js/lib/model/Types";

/**
 * Non-persistent color overrides for the renderer. The coordinator owns all
 * writes and repaints; rendering only reads (ADR EDT-2).
 */
export class ColorPickerPreviewState {
    private readonly colors = new Map<Element, string>();

    get(element: Element): string | undefined {
        return this.colors.get(element);
    }

    replace(entries: readonly (readonly [Element, string])[]): Element[] {
        const affected = new Set(this.colors.keys());
        this.colors.clear();
        entries.forEach(([element, color]) => {
            this.colors.set(element, color);
            affected.add(element);
        });
        return [...affected];
    }

    clear(): Element[] {
        const affected = [...this.colors.keys()];
        this.colors.clear();
        return affected;
    }
}
