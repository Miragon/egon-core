import { DomainStoryDocument } from "../../../story/domain/DomainStoryDocument";
import { ViewportData } from "../model/Viewport";

/**
 * What an import had to throw away to produce a loadable story.
 *
 * WHY ids rather than the dropped elements: a host's only sensible reaction is
 * to tell the user the file was lossy and name what is missing. Handing out the
 * internal business objects would leak the model representation across the
 * public API and invite hosts to write to it.
 */
export interface ImportRepairData {
    removedConnectionIds: string[];
}

/**
 * Port interface for diagram modeler operations.
 * Infrastructure layer provides the concrete implementation.
 */
export interface ModelerPort {
    /**
     * Import a domain story document into the diagram.
     */
    import(document: DomainStoryDocument): void;

    /**
     * Export the current diagram state.
     */
    export(): DomainStoryDocument;

    /**
     * Get the current viewport as a fresh object containing exactly
     * `{ x, y, width, height }`.
     */
    getViewport(): ViewportData;

    /**
     * Set the viewport.
     */
    setViewport(viewport: ViewportData): void;

    /**
     * Shift all diagram contents so they sit at positive coordinates
     * (origin + offset). Keeps stories exportable by external tools that
     * choke on negative coordinates. Runs through the command stack, so it is
     * undoable and fires story-changed — hosts should call it before a visual
     * export, not on every edit.
     */
    alignToOrigin(): void;

    /**
     * Align to origin, then fit the whole story into the visible canvas.
     * Upstream `fitStoryToScreen` parity for a UI "fit to screen" button.
     * Because it aligns first, it too may fire story-changed.
     */
    fitToScreen(): void;

    /**
     * Subscribe to internal diagram events. Each method is idempotent for the
     * same callback; one call to its matching `off` method fully removes that
     * event subscription, including a pending debounced delivery.
     */
    onStoryChanged(callback: () => void): void;
    /**
     * The viewport callback receives a fresh object containing exactly
     * `{ x, y, width, height }`.
     */
    onViewportChanged(callback: (viewport: ViewportData) => void): void;

    /**
     * Subscribe to "the last import silently dropped something". Fires at most
     * once per `import()`, and only when there was damage to repair.
     */
    onImportRepaired(callback: (repair: ImportRepairData) => void): void;

    /**
     * Unsubscribe from events.
     */
    offStoryChanged(callback: () => void): void;
    offViewportChanged(callback: (viewport: ViewportData) => void): void;
    offImportRepaired(callback: (repair: ImportRepairData) => void): void;

    /**
     * Clean up resources.
     */
    destroy(): void;
}
