export interface TopLeftPosition {
    x: number;
    y: number;
}

export interface GroupBounds extends TopLeftPosition {
    width: number;
    height: number;
}

/**
 * Ignores the candidate's width and height on purpose, preserving the
 * notation's established partial-overlap behaviour.
 */
export function isTopLeftInsideGroup(
    candidate: TopLeftPosition,
    group: GroupBounds,
): boolean {
    return (
        candidate.x >= group.x &&
        candidate.x <= group.x + group.width &&
        candidate.y >= group.y &&
        candidate.y <= group.y + group.height
    );
}
