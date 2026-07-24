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
 * Static registry of the shared import test fixtures.
 *
 * Fixtures are pulled in as ESM JSON imports (not `node:fs`) so the same helper
 * works in every tier — node, jsdom, and browser mode — none of which can be
 * assumed to have a filesystem. This also sidesteps `import.meta`, which the
 * commonjs-typechecked spec config rejects.
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
 * Returns a fixture by filename, deep-cloned on every call.
 *
 * The clone matters: JSON module imports are cached singletons shared across a
 * whole test run, so a spec that mutates a fixture (the round-trip spec renames
 * an element in place) would otherwise corrupt it for every later spec.
 */
export function importFixture<T = unknown>(name: FixtureName): T {
    return structuredClone(FIXTURES[name]) as T;
}
