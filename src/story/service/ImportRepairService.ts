import { BusinessObject } from "../domain/businessObject";
import {
    PrunedStory,
    normalizeIconNameWhitespace,
    numberActivitiesFromActors,
    pruneUnreferencedConnections,
    renameLegacyWorkObjectTypes,
    stripBpmnProperties,
    useLegacyAnnotationNumberAsHeight,
} from "../domain/importRepair";

/**
 * Service-layer facade over the pure repair rules in
 * `src/story/domain/importRepair.ts`.
 *
 * WHY it still exists after the rules moved to the domain: upstream Egon.io has
 * an `ImportRepairService` with exactly these four method names, and the import
 * service calls them in this order. Keeping the seam means a future sync round
 * can diff upstream's file against this one line for line instead of against a
 * reshaped call site (see SYNC.md). It holds no state and adds no logic — every
 * method is one delegation.
 *
 * The last two methods have **no upstream counterpart**: they took over work the
 * renderer used to do on every paint (#74), so they are named for what they do
 * rather than matched to an upstream name.
 */
export class ImportRepairService {
    /**
     * Removes edges whose endpoints are not in the story.
     *
     * Diverges from upstream deliberately: upstream mutates `elements` and
     * returns a `boolean` that its only call site discards, which both hid the
     * `splice`-rebinding bug and threw away the information a host needs to warn
     * the user. Returning the {@link PrunedStory} makes the loss a value.
     */
    checkForUnreferencedElementsInActivitiesAndRepair(
        elements: readonly BusinessObject[],
    ): PrunedStory {
        return pruneUnreferencedConnections(elements);
    }

    /**
     * Ensure backwards compatibility.
     * Previously Document had no special name and was just addressed as workObject
     * Bubble was renamed to Conversation
     */
    updateCustomElementsPreviousV050(
        elements: BusinessObject[],
    ): BusinessObject[] {
        return renameLegacyWorkObjectTypes(elements);
    }

    // Early versions of Egon allowed Whitespaces in Icon names which are now not supported anymore.
    // To find the right icon in the dictionary, they need to be replaced.
    removeWhitespacesFromIcons(elements: BusinessObject[]): BusinessObject[] {
        return normalizeIconNameWhitespace(elements);
    }

    /** Drops the BPMN moddle leftovers v1.3.0+ files still carry. */
    removeUnnecessaryBpmnProperties(
        elements: BusinessObject[],
    ): BusinessObject[] {
        return stripBpmnProperties(elements);
    }

    /**
     * Translates a pre-#74 annotation whose box height was smuggled through
     * `number` into a plain `height`, and retires the field.
     */
    restoreAnnotationHeights(elements: BusinessObject[]): BusinessObject[] {
        return useLegacyAnnotationNumberAsHeight(elements);
    }

    /**
     * Completes an actor's activity sequence, which the renderer used to do on
     * every paint. Runs after the dangling-edge prune so a dropped activity does
     * not reserve a number.
     */
    numberUnnumberedActivitiesFromActors(
        elements: BusinessObject[],
    ): BusinessObject[] {
        return numberActivitiesFromActors(elements);
    }
}
