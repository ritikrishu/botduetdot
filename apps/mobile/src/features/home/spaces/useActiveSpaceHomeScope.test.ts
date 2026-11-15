import {
  resolveSidebarSpaceScope,
  type HomedSidebarSpace,
  type SidebarSpaceProjectGroup,
} from "@t3tools/client-runtime/state/sidebar-spaces";
import { EnvironmentId, ProjectId } from "@t3tools/contracts";
import { expect, it, vi } from "vite-plus/test";

// The mapping is pure; loading SecureStore and the live mobile registry is unnecessary.
vi.mock("./mobileSpacesState", () => ({}));

import { mobileSpaceHomeScopeResult } from "./useActiveSpaceHomeScope";

const environmentId = EnvironmentId.make("env");
const projectRef = { environmentId, projectId: ProjectId.make("project") };
const space: HomedSidebarSpace = {
  key: "env:work",
  homeEnvironmentId: environmentId,
  space: { id: "work", name: "Work", icon: "W", projectRefs: ["env:project"] },
};
const group: SidebarSpaceProjectGroup = {
  key: "env:project",
  projectRefs: [projectRef],
  isScratch: false,
};

it.each([
  {
    name: "zero spaces uses the upstream path",
    spaces: [],
    activeSpaceKey: null,
    groups: [group],
    hasManualFilter: false,
    expected: { selection: { kind: "all" }, unresolvedSpaceKey: null, list: null },
  },
  {
    name: "an active space scopes the list to its groups",
    spaces: [space],
    activeSpaceKey: space.key,
    groups: [group],
    hasManualFilter: false,
    expected: {
      selection: { kind: "space", spaceKey: space.key },
      unresolvedSpaceKey: null,
      list: {
        scopeKey: "space:env:work",
        scope: { key: "space:env:work", title: "Work", projectRefs: [projectRef] },
      },
    },
  },
  {
    name: "an unresolved space lists everything and keeps its dimmed key",
    spaces: [space],
    activeSpaceKey: space.key,
    groups: [],
    hasManualFilter: false,
    expected: {
      selection: { kind: "all" },
      unresolvedSpaceKey: space.key,
      list: { scopeKey: null, scope: null },
    },
  },
  {
    name: "a manual filter without an active space uses the upstream path",
    spaces: [space],
    activeSpaceKey: null,
    groups: [group],
    hasManualFilter: true,
    expected: { selection: { kind: "custom" }, unresolvedSpaceKey: null, list: null },
  },
])("$name", ({ expected, name: _name, ...input }) => {
  expect(mobileSpaceHomeScopeResult(resolveSidebarSpaceScope({ enabled: true, ...input }))).toEqual(
    expected,
  );
});
