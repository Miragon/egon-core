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
 * Facade over `domain/importRepair` that keeps upstream's method names, so sync
 * rounds can diff it line for line (see SYNC.md). The last two methods have no
 * upstream counterpart.
 */
export class ImportRepairService {
    /**
     * Diverges from upstream, which returns a discarded boolean: the
     * {@link PrunedStory} lets a host warn the user about the loss.
     */
    checkForUnreferencedElementsInActivitiesAndRepair(
        elements: readonly BusinessObject[],
    ): PrunedStory {
        return pruneUnreferencedConnections(elements);
    }

    updateCustomElementsPreviousV050(
        elements: BusinessObject[],
    ): BusinessObject[] {
        return renameLegacyWorkObjectTypes(elements);
    }

    removeWhitespacesFromIcons(
        elements: BusinessObject[],
        availableIconNames: ReadonlySet<string>,
    ): BusinessObject[] {
        return normalizeIconNameWhitespace(elements, availableIconNames);
    }

    removeUnnecessaryBpmnProperties(
        elements: BusinessObject[],
    ): BusinessObject[] {
        return stripBpmnProperties(elements);
    }

    restoreAnnotationHeights(elements: BusinessObject[]): BusinessObject[] {
        return useLegacyAnnotationNumberAsHeight(elements);
    }

    /** Run after the prune, so a dropped activity does not reserve a number. */
    numberUnnumberedActivitiesFromActors(
        elements: BusinessObject[],
    ): BusinessObject[] {
        return numberActivitiesFromActors(elements);
    }
}
