declare module "diagram-js-direct-editing" {
    import { Element } from "diagram-js/lib/model/Types";
    import { Rect } from "diagram-js/lib/util/Types";

    /**
     * Typed explicitly because DirectEditing calls
     * `update(element, newText, oldText, bounds)` (lib/DirectEditing.js:120);
     * a 3-parameter provider would receive the old text as its bounds.
     */
    export interface DirectEditingProvider {
        /**
         * Returns the editing context (text, bounds, style, options) or
         * `undefined` when the element is not editable.
         */
        activate(element: Element): any;

        update(
            element: Element,
            newLabel: string,
            oldLabel: string,
            bounds: Rect,
        ): void;
    }

    /**
     * An interface, not a class: the package exports only a didi module, so
     * `DirectEditing` never exists as a runtime value.
     */
    export interface DirectEditing {
        registerProvider(provider: DirectEditingProvider): void;

        isActive(element?: Element): boolean;

        cancel(): void;

        close(): void;

        complete(): void;

        getValue(): string;

        activate(element: Element): boolean;
    }

    const DirectEditingModule: any;
    export default DirectEditingModule;
}
