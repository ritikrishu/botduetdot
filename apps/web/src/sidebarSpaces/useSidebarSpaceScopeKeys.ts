import { resolveSidebarSpaceScope } from "@t3tools/client-runtime/state/sidebar-spaces";

import type { SidebarProjectSnapshot } from "../sidebarProjectGrouping";
import { useUiStateStore } from "../uiStateStore";
import {
  setSidebarScopeKeysLeavingSpace,
  sidebarSpaceGroupsOf,
  useActiveSidebarSpaceKey,
  useSidebarSpaces,
  useSidebarSpacesEnabled,
} from "./state";

export function useSidebarSpaceScope(projectGroups: ReadonlyArray<SidebarProjectSnapshot>) {
  const enabled = useSidebarSpacesEnabled();
  const spaces = useSidebarSpaces();
  const activeSpaceKey = useActiveSidebarSpaceKey();
  const hasManualFilter = useUiStateStore((store) => store.sidebarProjectScopeKeys.length > 0);
  return resolveSidebarSpaceScope({
    enabled,
    spaces,
    activeSpaceKey,
    groups: sidebarSpaceGroupsOf(projectGroups),
    hasManualFilter,
  });
}

export function useSidebarSpaceScopeKeys(
  projectGroups: ReadonlyArray<SidebarProjectSnapshot>,
): readonly [ReadonlyArray<string>, (keys: readonly string[]) => void] {
  const scope = useSidebarSpaceScope(projectGroups);
  const keys = useUiStateStore((store) => store.sidebarProjectScopeKeys);
  const setKeys = useUiStateStore((store) => store.setSidebarProjectScopeKeys);
  return [
    scope.spaceGroups === null ? keys : scope.spaceGroups.map((group) => group.key),
    scope.detachOnWrite ? setSidebarScopeKeysLeavingSpace : setKeys,
  ];
}
