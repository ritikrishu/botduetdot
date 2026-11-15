import { pickableProjectGroups } from "@t3tools/client-runtime/state/project-grouping";
import type { EnvironmentProject } from "@t3tools/client-runtime/state/shell";
import {
  resolveSidebarSpaceScope,
  type SidebarSpaceSelection,
  type HomedSidebarSpace,
  type SidebarSpaceProjectGroup,
  type SidebarSpaceScope,
} from "@t3tools/client-runtime/state/sidebar-spaces";
import type { ScopedProjectRef, SidebarProjectGroupingMode } from "@t3tools/contracts";
import { useCallback, useMemo } from "react";
import { buildHomeProjectScopes } from "../homeThreadList";
import {
  setActiveMobileSidebarSpaceKey,
  useActiveMobileSidebarSpaceKey,
  useMobileSidebarSpaces,
} from "./mobileSpacesState";

export interface MobileActiveSpace {
  readonly spaces: ReadonlyArray<HomedSidebarSpace>;
  readonly groups: ReadonlyArray<SidebarSpaceProjectGroup>;
  readonly selection: SidebarSpaceSelection;
  readonly unresolvedSpaceKey: string | null;
  readonly list: {
    readonly scopeKey: string | null;
    readonly scope: {
      readonly key: string;
      readonly title: string;
      readonly projectRefs: ReadonlyArray<ScopedProjectRef>;
    } | null;
  } | null;
}

function useMobileSpaceProjectGroups(
  projects: ReadonlyArray<EnvironmentProject>,
  projectGroupingMode: SidebarProjectGroupingMode,
) {
  return useMemo(
    () =>
      pickableProjectGroups(
        buildHomeProjectScopes({ projects, environmentId: null, projectGroupingMode }),
      ).map((group) => ({
        key: group.key,
        projectRefs: group.projectRefs,
        isScratch: group.representative.isScratch === true,
      })),
    [projects, projectGroupingMode],
  );
}

export function useActiveSpaceHomeScope(input: {
  readonly projects: ReadonlyArray<EnvironmentProject>;
  readonly projectGroupingMode: SidebarProjectGroupingMode;
  readonly selectedProjectKey: string | null;
}): MobileActiveSpace {
  const spaces = useMobileSidebarSpaces();
  const activeSpaceKey = useActiveMobileSidebarSpaceKey();
  const groups = useMobileSpaceProjectGroups(input.projects, input.projectGroupingMode);
  const scope = resolveSidebarSpaceScope({
    enabled: true,
    spaces,
    activeSpaceKey,
    groups,
    hasManualFilter: input.selectedProjectKey !== null,
  });
  return { spaces, groups, ...mobileSpaceHomeScopeResult(scope) };
}

export function mobileSpaceHomeScopeResult(
  scope: SidebarSpaceScope<SidebarSpaceProjectGroup>,
): Pick<MobileActiveSpace, "selection" | "unresolvedSpaceKey" | "list"> {
  const key = scope.activeSpace ? `space:${scope.activeSpace.key}` : null;
  return {
    selection: scope.selection,
    unresolvedSpaceKey: scope.unresolvedSpaceKey,
    list:
      scope.spaceGroups === null
        ? null
        : scope.spaceGroups.length === 0 || !scope.activeSpace || key === null
          ? { scopeKey: null, scope: null }
          : {
              scopeKey: key,
              scope: {
                key,
                title: scope.activeSpace.space.name,
                projectRefs: scope.spaceGroups.flatMap((group) => group.projectRefs),
              },
            },
  };
}

export function useSpaceDetachingProjectKeySetter(
  set: (key: string | null) => void,
): (key: string | null) => void {
  return useCallback(
    (key) => {
      setActiveMobileSidebarSpaceKey(null);
      set(key);
    },
    [set],
  );
}

export function selectMobileSpace(
  key: string | null,
  setProjectKey: (key: string | null) => void,
  setSpaceKey: (key: string | null) => void,
): void {
  setProjectKey(null);
  setSpaceKey(key);
}
