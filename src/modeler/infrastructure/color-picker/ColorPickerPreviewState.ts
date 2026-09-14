import type { Element } from "diagram-js/lib/model/Types";

/**
 * Session-local, non-persistent color overrides consumed by the renderer.
 *
 * This service deliberately knows nothing about events, commands, selection,
 * or business objects. The coordinator owns all writes and repaint requests;
 * rendering only asks for the current override (ADR 0026).
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
