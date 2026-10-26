import dst_1_0_0 from "../fixtures/dst_export_version_1_0_0.json";
import dst_1_1_0 from "../fixtures/dst_export_version_1_1_0.json";
import dst_1_2_0 from "../fixtures/dst_export_version_1_2_0.json";
import dst_1_3_0 from "../fixtures/dst_export_version_1_3_0.json";
import dst_1_4_0 from "../fixtures/dst_export_version_1_4_0.json";
import dst_1_5_0 from "../fixtures/dst_export_version_1_5_0.json";
import dst_2_2_0 from "../fixtures/dst_export_version_2_2_0.json";
import egn_4_0_0 from "../fixtures/egn_export_version_4_0_0.json";
import egn_cinema from "../fixtures/egn_cinema_story.egn.json";

/**
 * JSON imports, not `node:fs`, so every tier works, browser mode included.
 * This also avoids `import.meta`, which the spec typecheck config rejects.
 */
const FIXTURES = {
    "dst_export_version_1_0_0.json": dst_1_0_0,
    "dst_export_version_1_1_0.json": dst_1_1_0,
    "dst_export_version_1_2_0.json": dst_1_2_0,
    "dst_export_version_1_3_0.json": dst_1_3_0,
    "dst_export_version_1_4_0.json": dst_1_4_0,
    "dst_export_version_1_5_0.json": dst_1_5_0,
    "dst_export_version_2_2_0.json": dst_2_2_0,
    "egn_export_version_4_0_0.json": egn_4_0_0,
    "egn_cinema_story.egn.json": egn_cinema,
} as const;

export type FixtureName = keyof typeof FIXTURES;

/**
 * Deep-cloned because JSON imports are cached singletons: a spec that mutates a
 * fixture would otherwise corrupt it for every later spec.
 */
export function importFixture<T = unknown>(name: FixtureName): T {
    return structuredClone(FIXTURES[name]) as T;
}
