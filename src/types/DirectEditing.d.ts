declare module "diagram-js-direct-editing" {
    import { Element } from "diagram-js/lib/model/Types";
    import { Rect } from "diagram-js/lib/util/Types";

    /**
     * The contract `registerProvider` expects. Typed explicitly because the
     * former `provider: any` hid a wrong `update()` arity: DirectEditing calls
     * `provider.update(element, newText, oldText, bounds)`
     * (diagram-js-direct-editing/lib/DirectEditing.js:120), so a 3-parameter
     * provider silently received the old text where it expected the bounds.
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
     * Declared as an interface, not a class: the package exports only a didi
     * module as its default export, so `DirectEditing` exists as a type but
     * never as a runtime value.
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
