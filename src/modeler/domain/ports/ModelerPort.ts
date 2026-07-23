import { DomainStoryDocument } from "../../../story/domain/DomainStoryDocument";
import { ViewportData } from "../model/Viewport";

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
     * Get the current viewport.
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
     * Subscribe to internal diagram events.
     */
    onStoryChanged(callback: () => void): void;
    onViewportChanged(callback: (viewport: ViewportData) => void): void;

    /**
     * Unsubscribe from events.
     */
    offStoryChanged(callback: () => void): void;
    offViewportChanged(callback: (viewport: ViewportData) => void): void;

    /**
     * Clean up resources.
     */
    destroy(): void;
}
