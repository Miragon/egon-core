import type { LabelEntry, LabelRename } from "./labelEntry";
import type { WorkObjectLabelEntry } from "./workObjectLabelEntry";
import type { CanvasObject } from "../../story/domain/canvasObject";

export type { LabelCategory, LabelEntry, LabelRename } from "./labelEntry";
export type { WorkObjectLabelEntry } from "./workObjectLabelEntry";

export interface LabelDictionary {
    readonly activities: readonly LabelEntry[];
    readonly workObjects: readonly WorkObjectLabelEntry[];
}

/** Resolved before a batch command starts, preserving simultaneous mapping. */
export interface ResolvedLabelRename {
    readonly element: CanvasObject;
    readonly name: string;
}

export type LabelRenameBatch = readonly LabelRename[];
