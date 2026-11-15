import {
  DEFAULT_SERVER_SETTINGS,
  EnvironmentId,
  ProjectId,
  SIDEBAR_SPACE_SCRATCH_REF,
  SourceControlProviderKind,
  type ServerSettings,
  type SidebarProjectGroupingMode,
  type SidebarSpace,
} from "@t3tools/contracts";
import { Atom, AtomRegistry } from "effect/reactivity";
import { describe, expect, it } from "vite-plus/test";

import type { EnvironmentProject } from "./models.ts";
import { buildProjectGroups, pickableProjectGroups } from "./projectGrouping.ts";
import {
  collectSidebarSpaces,
  createSidebarSpacesAtom,
  findSidebarSpace,
  homeEnvironmentForNewSidebarSpace,
  moveSidebarSpace,
  parseSidebarSpaceKey,
  removeSidebarSpace,
  resolveSidebarSpaceCommand,
  resolveSidebarSpaceGroups,
  resolveSidebarSpaceScope,
  sidebarSpaceIconParts,
  sidebarSpaceKey,
  sidebarSpaceMonogram,
  sidebarSpaceProjectRefKeys,
  sidebarSpaceProjectRefs,
  sidebarSpacesNeedingAttention,
  SIDEBAR_SPACE_SLOT_COUNT,
  upsertSidebarSpace,
} from "./sidebarSpaces.ts";

const A = EnvironmentId.make("A");
const B = EnvironmentId.make("B");
const repositoryKey = "github.com/example/repo";

function space(id: string, projectRefs: readonly string[] = ["A:p1"]): SidebarSpace {
  return { id, name: `Space ${id}`, icon: "🤖", projectRefs };
}

function project(
  id: string,
  path: string,
  overrides: Partial<EnvironmentProject> = {},
): EnvironmentProject {
  return {
    id: ProjectId.make(id),
    environmentId: A,
    title: id,
    workspaceRoot: `/repo/${path}`,
    repositoryIdentity: {
      canonicalKey: repositoryKey,
      locator: {
        source: "git-remote",
        remoteName: "origin",
        remoteUrl: "https://github.com/example/repo.git",
      },
      provider: SourceControlProviderKind.make("github"),
      owner: "example",
      name: "repo",
      displayName: "Repo",
      rootPath: "/repo",
    },
    defaultModelSelection: null,
    scripts: [],
    createdAt: "2026-11-15T00:00:00.000Z",
    updatedAt: "2026-11-15T00:00:00.000Z",
    ...overrides,
  };
}

const localProjects = [project("p1", "a"), project("p2", "b")];

function groups(mode: SidebarProjectGroupingMode, projects = localProjects) {
  return pickableProjectGroups(
    buildProjectGroups({
      projects,
      settings: { sidebarProjectGroupingMode: mode, sidebarProjectGroupingOverrides: {} },
      groupScratchProjects: true,
    }),
  ).map((group) => ({
    key: group.key,
    projectRefs: group.memberProjectRefs,
    isScratch: group.representative.isScratch === true,
  }));
}

describe("space identity and collection", () => {
  it("orders preferred sources first and dedupes only within each home", () => {
    const first = space("x");
    const sources = [
      { environmentId: A, spaces: [first, { ...first, name: "Duplicate" }, space("y")] },
      { environmentId: B, spaces: [space("x", ["B:q1"])] },
    ];
    const preferredA = collectSidebarSpaces({ sources, preferredEnvironmentId: A });
    const preferredB = collectSidebarSpaces({ sources, preferredEnvironmentId: B });
    expect(preferredA.map((entry) => entry.key)).toEqual(["A:x", "A:y", "B:x"]);
    expect(preferredB.map((entry) => entry.key)).toEqual(["B:x", "A:x", "A:y"]);
    expect(preferredA[0]?.space).toBe(first);
    expect(findSidebarSpace(preferredB, "A:x")).toEqual(findSidebarSpace(preferredA, "A:x"));
    expect(collectSidebarSpaces({ sources, preferredEnvironmentId: null })).toEqual(preferredA);
    expect(collectSidebarSpaces({ sources: [], preferredEnvironmentId: A })).toEqual([]);
    expect(findSidebarSpace(preferredA, null)).toBeNull();
    expect(findSidebarSpace(preferredA, "offline:x")).toBeNull();
  });

  it("parses composite keys at the first colon", () => {
    for (const id of ["x", "x:with:colons"]) {
      expect(parseSidebarSpaceKey(sidebarSpaceKey(A, id))).toEqual({
        homeEnvironmentId: A,
        spaceId: id,
      });
    }
    for (const key of ["", "x", ":x", "A:"]) expect(parseSidebarSpaceKey(key)).toBeNull();
  });
});

describe("project membership across grouping modes", () => {
  it.each(["repository", "repository_path", "separate"] as const)(
    "resolves member refs and scratch in %s mode, never stored group keys",
    (mode) => {
      const shown = groups(mode, [
        ...localProjects,
        project("scratch", "scratch", { isScratch: true, repositoryIdentity: null }),
        project("scratch-remote", "scratch", {
          environmentId: B,
          isScratch: true,
          repositoryIdentity: null,
        }),
      ]);
      const matched = resolveSidebarSpaceGroups(space("x", ["A:p1", "A:p2"]), shown);
      expect(matched.length).toBe(mode === "repository" ? 1 : 2);
      expect(sidebarSpaceProjectRefKeys(space("x", ["A:p1", "A:p2"]), shown)).toEqual(
        new Set(["A:p1", "A:p2"]),
      );
      expect(
        resolveSidebarSpaceGroups(space("x", [repositoryKey, `${repositoryKey}::a`]), shown),
      ).toEqual([]);
      expect(resolveSidebarSpaceGroups(space("x", ["missing:p"]), shown)).toEqual([]);
      const scratch = resolveSidebarSpaceGroups(space("x", [SIDEBAR_SPACE_SCRATCH_REF]), shown);
      expect(scratch).toEqual(shown.filter((group) => group.isScratch));
      expect(scratch).toHaveLength(1);
      expect(sidebarSpaceProjectRefKeys(space("x", [SIDEBAR_SPACE_SCRATCH_REF]), shown)).toEqual(
        new Set(["A:scratch", "B:scratch-remote"]),
      );
    },
  );

  it("expands the displayed scope to all members of a matched coarse group", () => {
    expect(sidebarSpaceProjectRefKeys(space("x", ["A:p1"]), groups("repository"))).toEqual(
      new Set(["A:p1", "A:p2"]),
    );
    expect(sidebarSpaceProjectRefKeys(space("x", ["A:p1"]), groups("repository_path"))).toEqual(
      new Set(["A:p1"]),
    );
  });

  it("stores refs only and cannot resurrect members removed in another grouping mode", () => {
    const coarse = groups("repository");
    const fine = groups("repository_path");
    const both = sidebarSpaceProjectRefs({
      previousRefs: [],
      shownGroups: coarse,
      selectedGroups: coarse,
    });
    expect(both).toEqual(["A:p1", "A:p2"]);
    const onlyA = sidebarSpaceProjectRefs({
      previousRefs: both,
      shownGroups: fine,
      selectedGroups: fine.filter((group) => group.key === `${repositoryKey}::a`),
    });
    expect(onlyA).toEqual(["A:p1"]);
    expect(
      sidebarSpaceProjectRefs({ previousRefs: onlyA, shownGroups: coarse, selectedGroups: coarse }),
    ).toEqual(onlyA);
    const none = sidebarSpaceProjectRefs({
      previousRefs: onlyA,
      shownGroups: fine,
      selectedGroups: [],
    });
    expect(none).toEqual([]);
    expect(resolveSidebarSpaceGroups({ projectRefs: none }, coarse)).toEqual([]);
  });

  it("keeps offline and archived refs while replacing the visible selection", () => {
    const shown = groups("separate", [
      ...localProjects,
      project("archived", "archived", { archivedAt: "2026-11-15T00:00:00.000Z" }),
    ]);
    expect(shown).toHaveLength(2);
    const selectedGroups = shown.filter((group) => group.key === "A:/repo/b");
    expect(
      sidebarSpaceProjectRefs({
        previousRefs: ["A:p1", "B:q1"],
        shownGroups: shown,
        selectedGroups,
      }),
    ).toEqual(["B:q1", "A:p2"]);
    expect(
      sidebarSpaceProjectRefs({
        previousRefs: ["A:p1", "A:archived", "B:q1"],
        shownGroups: shown,
        selectedGroups,
      }),
    ).toEqual(["A:archived", "B:q1", "A:p2"]);
  });

  it("adds and removes only the scratch sentinel, and keeps it while scratch is unavailable", () => {
    const scratch = groups("repository", [
      project("scratch", "scratch", { isScratch: true, repositoryIdentity: null }),
    ]);
    expect(
      sidebarSpaceProjectRefs({ previousRefs: [], shownGroups: scratch, selectedGroups: scratch }),
    ).toEqual([SIDEBAR_SPACE_SCRATCH_REF]);
    expect(
      sidebarSpaceProjectRefs({
        previousRefs: ["A:scratch"],
        shownGroups: scratch,
        selectedGroups: scratch,
      }),
    ).toEqual([SIDEBAR_SPACE_SCRATCH_REF]);
    expect(
      sidebarSpaceProjectRefs({
        previousRefs: [SIDEBAR_SPACE_SCRATCH_REF],
        shownGroups: scratch,
        selectedGroups: [],
      }),
    ).toEqual([]);
    expect(
      sidebarSpaceProjectRefs({
        previousRefs: [SIDEBAR_SPACE_SCRATCH_REF],
        shownGroups: [],
        selectedGroups: [],
      }),
    ).toEqual([SIDEBAR_SPACE_SCRATCH_REF]);
  });

  it("dedupes without reordering surviving refs on a no-op save", () => {
    const shown = groups("repository_path");
    expect(
      sidebarSpaceProjectRefs({
        previousRefs: ["A:p2", "B:q1", "A:p1", "A:p2"],
        shownGroups: shown,
        selectedGroups: shown,
      }),
    ).toEqual(["A:p2", "B:q1", "A:p1"]);
  });
});

describe("effective space scope", () => {
  const spaces = collectSidebarSpaces({
    sources: [{ environmentId: A, spaces: [space("x")] }],
    preferredEnvironmentId: null,
  });

  it.each([false, true])("handles each seam state with manual filter = %s", (hasManualFilter) => {
    const shown = groups("repository_path");
    const base = { enabled: true, spaces, activeSpaceKey: "A:x", groups: shown, hasManualFilter };
    const manualSelection = { kind: hasManualFilter ? "custom" : "all" };
    expect(resolveSidebarSpaceScope({ ...base, enabled: false })).toEqual({
      activeSpace: spaces[0],
      spaceGroups: null,
      selection: manualSelection,
      unresolvedSpaceKey: null,
      detachOnWrite: false,
    });
    expect(resolveSidebarSpaceScope({ ...base, activeSpaceKey: null })).toEqual({
      activeSpace: null,
      spaceGroups: null,
      selection: manualSelection,
      unresolvedSpaceKey: null,
      detachOnWrite: false,
    });
    expect(resolveSidebarSpaceScope(base)).toEqual({
      activeSpace: spaces[0],
      spaceGroups: [shown[0]],
      selection: { kind: "space", spaceKey: "A:x" },
      unresolvedSpaceKey: null,
      detachOnWrite: true,
    });
    expect(resolveSidebarSpaceScope({ ...base, groups: [] })).toEqual({
      activeSpace: spaces[0],
      spaceGroups: [],
      selection: { kind: "all" },
      unresolvedSpaceKey: "A:x",
      detachOnWrite: true,
    });
    expect(resolveSidebarSpaceScope({ ...base, activeSpaceKey: "offline:x" })).toEqual({
      activeSpace: null,
      spaceGroups: null,
      selection: manualSelection,
      unresolvedSpaceKey: null,
      detachOnWrite: true,
    });
    expect(resolveSidebarSpaceScope({ ...base, spaces: [] })).toEqual({
      activeSpace: null,
      spaceGroups: null,
      selection: manualSelection,
      unresolvedSpaceKey: null,
      detachOnWrite: true,
    });
  });
});

describe("attention", () => {
  it("honors listed/status predicates and flags overlapping spaces independently by composite key", () => {
    const spaces = [
      { key: "A:x", projectRefKeys: new Set(["A:p1"]) },
      { key: "B:x", projectRefKeys: new Set(["B:q1"]) },
      { key: "A:shared", projectRefKeys: new Set(["A:p1", "B:q1"]) },
      { key: "A:archived", projectRefKeys: new Set(["A:archived"]) },
      { key: "A:child", projectRefKeys: new Set(["A:child"]) },
    ];
    const threads = [
      { environmentId: "A", projectId: "p1", archived: false, listed: true, needs: true },
      { environmentId: "B", projectId: "q1", archived: false, listed: true, needs: false },
      { environmentId: "A", projectId: "archived", archived: true, listed: true, needs: true },
      { environmentId: "A", projectId: "child", archived: false, listed: false, needs: true },
    ];
    const input = {
      spaces,
      threads,
      isListed: (thread: (typeof threads)[number]) => !thread.archived && thread.listed,
      needsYou: (thread: (typeof threads)[number]) => thread.needs,
    };
    expect(sidebarSpacesNeedingAttention(input)).toEqual(new Set(["A:x", "A:shared"]));
    expect(
      sidebarSpacesNeedingAttention({
        ...input,
        threads: [
          { environmentId: "B", projectId: "q1", archived: false, listed: true, needs: true },
        ],
      }),
    ).toEqual(new Set(["B:x", "A:shared"]));
    expect(sidebarSpacesNeedingAttention({ ...input, needsYou: () => false })).toEqual(new Set());
    expect(sidebarSpacesNeedingAttention({ ...input, isListed: () => false })).toEqual(new Set());
  });
});

describe("space commands", () => {
  it("cycles through All in both directions and treats stale keys as All", () => {
    const spaceKeys = ["A:x", "B:y"];
    for (const [command, activeSpaceKey, target] of [
      ["sidebar.space.next", null, "A:x"],
      ["sidebar.space.next", "A:x", "B:y"],
      ["sidebar.space.next", "B:y", null],
      ["sidebar.space.previous", null, "B:y"],
      ["sidebar.space.previous", "B:y", "A:x"],
      ["sidebar.space.previous", "A:x", null],
      ["sidebar.space.next", "missing:x", "A:x"],
      ["sidebar.space.previous", "missing:x", "B:y"],
      ["sidebar.space.all", "A:x", null],
    ] as const) {
      expect(resolveSidebarSpaceCommand({ command, activeSpaceKey, spaceKeys })).toEqual({
        spaceKey: target,
      });
    }
  });

  it("selects numbered slots and passes through empty slots and other commands", () => {
    const spaceKeys = Array.from(
      { length: SIDEBAR_SPACE_SLOT_COUNT + 1 },
      (_, index) => `A:${index}`,
    );
    for (let slot = 1; slot <= SIDEBAR_SPACE_SLOT_COUNT; slot++) {
      expect(
        resolveSidebarSpaceCommand({
          command: `sidebar.space.${slot}`,
          activeSpaceKey: null,
          spaceKeys,
        }),
      ).toEqual({ spaceKey: spaceKeys[slot - 1] });
    }
    for (const command of [
      "sidebar.space.10",
      "sidebar.space.0",
      "sidebar.space.01",
      "thread.next",
    ]) {
      expect(resolveSidebarSpaceCommand({ command, activeSpaceKey: null, spaceKeys })).toBeNull();
    }
    expect(
      resolveSidebarSpaceCommand({
        command: "sidebar.space.2",
        activeSpaceKey: null,
        spaceKeys: ["A:x"],
      }),
    ).toBeNull();
    for (const command of ["sidebar.space.next", "sidebar.space.previous", "sidebar.space.1"]) {
      expect(
        resolveSidebarSpaceCommand({ command, activeSpaceKey: null, spaceKeys: [] }),
      ).toBeNull();
    }
    expect(
      resolveSidebarSpaceCommand({
        command: "sidebar.space.all",
        activeSpaceKey: "offline:x",
        spaceKeys: [],
      }),
    ).toEqual({ spaceKey: null });
    expect(
      resolveSidebarSpaceCommand({
        command: "sidebar.space.next",
        activeSpaceKey: spaceKeys[8]!,
        spaceKeys,
      }),
    ).toEqual({ spaceKey: spaceKeys[9] });
  });
});

describe("editing one home's list", () => {
  it("appends, replaces in place and dedupes every write without mutating the source", () => {
    const x = space("x");
    const y = space("y");
    const source = [x, { ...x, name: "Duplicate" }, y];
    const replacement = { ...x, name: "Renamed" };
    expect(upsertSidebarSpace(source, space("z"))).toEqual([x, y, space("z")]);
    expect(upsertSidebarSpace(source, replacement)).toEqual([replacement, y]);
    expect(removeSidebarSpace(source, "missing")).toEqual([x, y]);
    expect(moveSidebarSpace(source, "x", -1)).toEqual([x, y]);
    expect(moveSidebarSpace(source, "y", 1)).toEqual([x, y]);
    expect(moveSidebarSpace(source, "x", 1)).toEqual([y, x]);
    expect(moveSidebarSpace(source, "y", -1)).toEqual([y, x]);
    expect(moveSidebarSpace(source, "missing", 1)).toEqual([x, y]);
    expect(source).toEqual([x, { ...x, name: "Duplicate" }, y]);
    expect(moveSidebarSpace([], "x", 1)).toEqual([]);
  });

  it("deletes every duplicate in one home while leaving another home's copy", () => {
    const x = space("x");
    const remaining = removeSidebarSpace([x, { ...x, name: "Duplicate" }], "x");
    const collected = collectSidebarSpaces({
      sources: [
        { environmentId: A, spaces: remaining },
        { environmentId: B, spaces: [x] },
      ],
      preferredEnvironmentId: A,
    });
    expect(collected.map((entry) => entry.key)).toEqual(["B:x"]);
    expect(homeEnvironmentForNewSidebarSpace(collected, A)).toBe(B);
    expect(homeEnvironmentForNewSidebarSpace([], A)).toBe(A);
    expect(homeEnvironmentForNewSidebarSpace([], null)).toBeNull();
  });
});

it("distinguishes icon strings and takes a whole first grapheme for monograms", () => {
  expect(sidebarSpaceIconParts("🤖")).toEqual({ kind: "text", text: "🤖" });
  expect(sidebarSpaceIconParts("lucide:bot")).toEqual({ kind: "lucide", name: "bot" });
  expect(sidebarSpaceIconParts("lucide:future-icon")).toEqual({
    kind: "lucide",
    name: "future-icon",
  });
  expect(sidebarSpaceMonogram("bots")).toBe("B");
  expect(sidebarSpaceMonogram("e\u0301quipe")).toBe("E\u0301");
  expect(sidebarSpaceMonogram("👩🏽‍💻 Work")).toBe("👩🏽‍💻");
  expect(sidebarSpaceMonogram("")).toBe("");
});

it("retains the atom value across equal settings pushes and tracks membership and ordering changes", () => {
  const registry = AtomRegistry.make();
  const environmentIdsAtom = Atom.make<ReadonlyArray<EnvironmentId>>([A, B]);
  const preferredEnvironmentIdAtom = Atom.make<EnvironmentId | null>(A);
  const settingsValueAtom = Atom.family((_id: EnvironmentId) =>
    Atom.make<ServerSettings | null>(null),
  );
  const atom = createSidebarSpacesAtom({
    environmentIdsAtom,
    settingsValueAtom,
    preferredEnvironmentIdAtom,
  });
  const unorderedAtom = createSidebarSpacesAtom({ environmentIdsAtom, settingsValueAtom });
  const stop = registry.subscribe(atom, () => {});
  try {
    expect(registry.get(atom)).toEqual([]);
    registry.set(settingsValueAtom(A), { ...DEFAULT_SERVER_SETTINGS, sidebarSpaces: [space("x")] });
    registry.set(settingsValueAtom(B), {
      ...DEFAULT_SERVER_SETTINGS,
      sidebarSpaces: [space("x", ["B:q1"])],
    });
    const first = registry.get(atom);
    registry.set(settingsValueAtom(A), {
      ...DEFAULT_SERVER_SETTINGS,
      hideTaggedThreads: true,
      sidebarSpaces: [space("x")],
    });
    expect(registry.get(atom)).toBe(first);
    registry.set(settingsValueAtom(A), {
      ...DEFAULT_SERVER_SETTINGS,
      sidebarSpaces: [space("x", ["A:p2"])],
    });
    const changed = registry.get(atom);
    expect(changed).not.toBe(first);
    expect(changed[0]?.space.projectRefs).toEqual(["A:p2"]);
    registry.set(preferredEnvironmentIdAtom, B);
    expect(registry.get(atom).map((entry) => entry.key)).toEqual(["B:x", "A:x"]);
    expect(registry.get(unorderedAtom).map((entry) => entry.key)).toEqual(["A:x", "B:x"]);
    registry.set(settingsValueAtom(B), null);
    expect(registry.get(atom).map((entry) => entry.key)).toEqual(["A:x"]);
    registry.set(environmentIdsAtom, []);
    expect(registry.get(atom)).toEqual([]);
  } finally {
    stop();
    registry.dispose();
  }
});
