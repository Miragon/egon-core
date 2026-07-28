import CommandInterceptor from "diagram-js/lib/command/CommandInterceptor";
import EventBus from "diagram-js/lib/core/EventBus";
import { Connection } from "diagram-js/lib/model/Types";

import { isActivity, isActor } from "../../../story/domain/elementPredicates";
import { DomainStoryNumberingRegistry } from "./DomainStoryNumberingRegistry";

/**
 * The commands that can change which shape an activity starts at — and therefore
 * whether it is a numbered story step at all.
 *
 * `connection.reconnect` covers "change type" for free: diagram-js'
 * `ReplaceShapeHandler.preExecute` re-points every attached connection through
 * `modeling.reconnectStart`/`reconnectEnd`, each of which is a nested
 * `connection.reconnect` command. `activity.directionChange` is deliberately
 * absent — `ActivityDirectionChangedHandler` computes its own number and owns
 * that transaction, as `activity.changed` owns the popup edit.
 */
const SOURCE_CHANGING_COMMANDS = ["connection.create", "connection.reconnect"];

/**
 * Owns an activity's automatic sequence number as part of the command that
 * changes its source.
 *
 * WHY it exists: until #74 the number was minted *and* cleared inside
 * `DomainStoryRenderer.renderExternalNumber`, i.e. by a repaint. Drawing is a
 * read — a mutation the command stack never saw could not be undone, was
 * re-applied on every paint, and made "does the model change?" depend on whether
 * something happened to be rendered. Moving it into an interceptor puts the write
 * where undo can see it and leaves the renderer with nothing to do but paint
 * whatever number the model already carries.
 *
 * WHY an interceptor rather than a handler: the numbering rides along with
 * diagram-js' own `connection.create`/`connection.reconnect` handlers, which this
 * package does not own. An interceptor extends those transactions instead of
 * wrapping them.
 */
export class DomainStoryActivityNumbering extends CommandInterceptor {
    static override $inject: string[] = [
        "eventBus",
        "domainStoryNumberingRegistry",
    ];

    constructor(
        eventBus: EventBus,
        private readonly numberingRegistry: DomainStoryNumberingRegistry,
    ) {
        super(eventBus);

        // Snapshot only. `preExecute` is skipped on redo, so anything mutated
        // here would make the redo path diverge from the first execute — the same
        // constraint `ActivityChangedHandler` documents.
        this.preExecute(SOURCE_CHANGING_COMMANDS, (event: any) => {
            const connection: Connection = event.context.connection;
            if (isActivity(connection)) {
                event.context.numberBeforeSourceChange =
                    connection.businessObject.number;
            }
        });

        // This *is* the redo path (diagram-js re-runs `execute` and re-fires
        // `executed`, never `preExecute`), so the whole decision has to live here.
        this.executed(SOURCE_CHANGING_COMMANDS, (event: any) =>
            this.applyNumber(event.context.connection),
        );

        this.reverted(SOURCE_CHANGING_COMMANDS, (event: any) =>
            this.restoreNumber(
                event.context.connection,
                event.context.numberBeforeSourceChange,
            ),
        );
    }

    /**
     * Mints a number for an actor-sourced activity that has none, and clears the
     * number of one that no longer starts at an actor.
     *
     * The `== null` guard keeps an existing number: a plain move or a re-point of
     * the *target* must not renumber a step, and an imported story must not be
     * renumbered by being reconnected.
     */
    private applyNumber(connection?: Connection): void {
        if (!connection || !isActivity(connection)) {
            return;
        }
        const businessObject = connection.businessObject;

        if (isActor(connection.source)) {
            if (businessObject.number == null) {
                // The write happens here, inside the interceptor's
                // executed/reverted hook, so it is part of the command's
                // transaction rather than something that leaked in ahead of it.
                businessObject.number =
                    this.numberingRegistry.generateAutomaticNumber();
            }
            return;
        }
        // `null`, never `undefined`: `JSON.stringify` drops `undefined`, so the
        // key would vanish from the exported bytes, where every historical file
        // and every fixture persists `"number": null` for an unnumbered activity.
        businessObject.number = null;
    }

    /**
     * Puts back the number the activity carried before the command.
     *
     * Normalized to `null` for the same format reason as {@link applyNumber}: a
     * story hand-written without the key at all would otherwise have it deleted
     * again by an undo, and `null` is what the previous render-time clear wrote.
     */
    private restoreNumber(
        connection: Connection | undefined,
        numberBeforeSourceChange: number | null | undefined,
    ): void {
        if (!connection || !isActivity(connection)) {
            return;
        }
        connection.businessObject.number = numberBeforeSourceChange ?? null;
    }
}
