export interface LabelEntry {
    readonly name: string;
    readonly originalName: string;
}

export type LabelCategory = "activity" | "workObject";

export interface LabelRename {
    readonly category: LabelCategory;
    readonly originalName: string;
    readonly name: string;
}
