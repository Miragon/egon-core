import CommandInterceptor from "diagram-js/lib/command/CommandInterceptor";
import EventBus from "diagram-js/lib/core/EventBus";
import { Connection } from "diagram-js/lib/model/Types";

import { isActivity, isActor } from "../../../story/domain/elementPredicates";
import { DomainStoryNumberingRegistry } from "./DomainStoryNumberingRegistry";

/**
 * `connection.reconnect` also covers "change type", whose replace re-points
 * attached connections through nested reconnects. `activity.directionChange` is
 * absent because its handler computes its own number.
 */
const SOURCE_CHANGING_COMMANDS = ["connection.create", "connection.reconnect"];

/**
 * Mints and clears an activity's number inside the command that changes its
 * source, so undo sees the write. An interceptor because the handlers it
 * extends belong to diagram-js.
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

        // Snapshot only: `preExecute` is skipped on redo, so a write here would
        // make redo diverge from the first execute.
        this.preExecute(SOURCE_CHANGING_COMMANDS, (event: any) => {
            const connection: Connection = event.context.connection;
            if (isActivity(connection)) {
                event.context.numberBeforeSourceChange =
                    connection.businessObject.number;
            }
        });

        // Redo re-fires `executed` but never `preExecute`, so the decision lives here.
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
     * The `== null` guard keeps an existing number: re-pointing the target or
     * reconnecting an imported story must not renumber a step.
     */
    private applyNumber(connection?: Connection): void {
        if (!connection || !isActivity(connection)) {
            return;
        }
        const businessObject = connection.businessObject;

        if (isActor(connection.source)) {
            if (businessObject.number == null) {
                businessObject.number =
                    this.numberingRegistry.generateAutomaticNumber();
            }
            return;
        }
        // `null`, never `undefined`: the file format persists `"number": null`,
        // and `JSON.stringify` would drop an `undefined` key.
        businessObject.number = null;
    }

    /** Normalized to `null` for the same format reason as {@link applyNumber}. */
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
