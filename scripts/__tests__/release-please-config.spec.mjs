import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import releasePlease from "release-please";

const require = createRequire(import.meta.url);
const { buildStrategy } = require("release-please/build/src/factory.js");
const {
    parseConventionalCommits,
} = require("release-please/build/src/commit.js");
const { Version } = require("release-please/build/src/version.js");
const { TagName } = require("release-please/build/src/util/tag-name.js");
const { Manifest, VERSION } = releasePlease;
const repositoryRoot = join(import.meta.dirname, "..", "..");
// Keep this equal to the release-please version bundled by the action SHA in
// .github/workflows/release-please.yml (from that action commit's lockfile).
const ACTION_RELEASE_PLEASE_VERSION = "17.6.0";

describe("release-please configuration", () => {
    it("uses the exact implementation pinned by the repository", async () => {
        const packageManifest = await readJson("package.json");

        expect(VERSION).toBe(ACTION_RELEASE_PLEASE_VERSION);
        expect(packageManifest.devDependencies["release-please"]).toBe(
            ACTION_RELEASE_PLEASE_VERSION,
        );
    });

    it.each([
        ["first release", undefined, "fix: existing fix", "0.1.0"],
        ["subsequent fix", "0.1.0", "fix: correct behavior", "0.1.1"],
        ["pre-1.0 feature", "0.1.0", "feat: add behavior", "0.2.0"],
        [
            "pre-1.0 breaking change",
            "0.1.0",
            "feat!: replace behavior",
            "0.2.0",
        ],
    ])("calculates %s as %s", async (_label, current, message, expected) => {
        const { manifest, github } = await configuredManifest();
        const strategy = await buildStrategy({
            ...manifest.repositoryConfig["."],
            github,
            path: ".",
            targetBranch: "main",
        });
        const commits = parseConventionalCommits([
            { sha: "a".repeat(40), message, files: ["src/index.ts"] },
        ]);
        const latestRelease = current
            ? {
                  tag: new TagName(Version.parse(current), "", undefined, true),
                  sha: "b".repeat(40),
                  notes: "",
              }
            : undefined;

        const pullRequest = await strategy.buildReleasePullRequest(
            commits,
            latestRelease,
        );

        expect(pullRequest.version.toString()).toBe(expected);
    });

    it("loads one root Node package, an empty bootstrap manifest, and v-only tags", async () => {
        const { manifest, github } = await configuredManifest();

        expect(github.getFileJson).toHaveBeenCalledWith(
            "release-please-config.json",
            "main",
        );
        expect(github.getFileJson).toHaveBeenCalledWith(
            ".release-please-manifest.json",
            "main",
        );
        expect(Object.keys(manifest.repositoryConfig)).toEqual(["."]);
        expect(manifest.releasedVersions).toEqual({});
        expect(manifest.repositoryConfig["."]).toMatchObject({
            releaseType: "node",
            initialVersion: "0.1.0",
            changelogPath: "CHANGELOG.md",
            includeComponentInTag: false,
            includeVInTag: true,
            bumpMinorPreMajor: true,
            bumpPatchForMinorPreMajor: false,
        });
    });
});

async function configuredManifest() {
    const config = await readJson("release-please-config.json");
    const versions = await readJson(".release-please-manifest.json");
    const packageContents = await readFile(
        join(repositoryRoot, "package.json"),
        "utf8",
    );
    const github = {
        repository: {
            owner: "Miragon",
            repo: "egon-core",
            defaultBranch: "main",
        },
        getFileJson: vi.fn(async (path) => {
            if (path === "release-please-config.json") return config;
            if (path === ".release-please-manifest.json") return versions;
            throw new Error(`Unexpected mocked GitHub file request: ${path}`);
        }),
        getFileContentsOnBranch: vi.fn(async () => ({
            sha: "c".repeat(40),
            content: Buffer.from(packageContents).toString("base64"),
            parsedContent: packageContents,
            mode: "100644",
        })),
    };
    return {
        manifest: await Manifest.fromManifest(github, "main"),
        github,
    };
}

async function readJson(path) {
    return JSON.parse(await readFile(join(repositoryRoot, path), "utf8"));
}
