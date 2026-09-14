import { Viewport } from "../model/Viewport";
import { IconSet } from "../../../iconSet/domain/IconTypes";
import type { LabelDictionary } from "../../../labelDictionary/domain/LabelDictionary";
import type { ReplayState } from "../../../story/domain/replay";

/**
 * Domain events emitted by the modeler.
 * These are internal events that get mapped to user-friendly event names.
 */
export interface StoryChangedEvent {
    readonly type: "StoryChanged";
}

export interface ViewportChangedEvent {
    readonly type: "ViewportChanged";
    readonly viewport: Viewport;
}

export interface IconsChangedEvent {
    readonly type: "IconsChanged";
    readonly icons: IconSet;
}

export interface LabelsChangedEvent {
    readonly type: "LabelsChanged";
    readonly labels: LabelDictionary;
}

export interface ReplayChangedEvent {
    readonly type: "ReplayChanged";
    readonly state: ReplayState;
}

export type DomainEvent =
    | StoryChangedEvent
    | ViewportChangedEvent
    | IconsChangedEvent
    | LabelsChangedEvent
    | ReplayChangedEvent;
