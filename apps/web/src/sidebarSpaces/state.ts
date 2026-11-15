import { useAtomValue } from "@effect/atom-react";
import { pickableProjectGroups } from "@t3tools/client-runtime/state/project-grouping";
import {
  createSidebarSpacesAtom,
  moveSidebarSpace,
  parseSidebarSpaceKey,
  removeSidebarSpace,
  upsertSidebarSpace,
  type HomedSidebarSpace,
  type SidebarSpaceProjectGroup,
} from "@t3tools/client-runtime/state/sidebar-spaces";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import { AuthSettingsWriteScope, type EnvironmentId, type SidebarSpace } from "@t3tools/contracts";
import * as Schema from "effect/Schema";

import { toastManager } from "../components/ui/toast";
import {
  readLocalStorageValue,
  useLocalStorage,
  writeLocalStorageValue,
} from "../hooks/useLocalStorage";
import { useClientSettings } from "../hooks/useSettings";
import { appAtomRegistry } from "../rpc/atomRegistry";
import type { SidebarProjectSnapshot } from "../sidebarProjectGrouping";
import { useEnvironments } from "../state/environments";
import { environmentSummaries } from "../state/presentation";
import { primaryEnvironmentIdAtom } from "../state/primaryEnvironment";
import { serverEnvironment } from "../state/server";
import { readEnvironmentScope, useEnvironmentsWithScope } from "../state/session";
import { useAtomCommand } from "../state/use-atom-command";
import { useThreadSelectionStore } from "../threadSelectionStore";
import { useUiStateStore } from "../uiStateStore";

export const ACTIVE_SIDEBAR_SPACE_STORAGE_KEY = "t3code:sidebar-spaces:active:v1";
const activeSidebarSpaceKeySchema = Schema.NullOr(Schema.String);

export const sidebarSpacesAtom = createSidebarSpacesAtom({
  environmentIdsAtom: environmentSummaries.connectedEnvironmentIdsAtom,
  settingsValueAtom: serverEnvironment.settingsValueAtom,
  preferredEnvironmentIdAtom: primaryEnvironmentIdAtom,
});

export function useSidebarSpaces(): ReadonlyArray<HomedSidebarSpace> {
  return useAtomValue(sidebarSpacesAtom);
}

export function useActiveSidebarSpaceKey(): string | null {
  return useLocalStorage(ACTIVE_SIDEBAR_SPACE_STORAGE_KEY, null, activeSidebarSpaceKeySchema)[0];
}

export function readActiveSidebarSpaceKey(): string | null {
  return readLocalStorageValue(ACTIVE_SIDEBAR_SPACE_STORAGE_KEY, null, activeSidebarSpaceKeySchema);
}

function writeActiveSidebarSpaceKey(spaceKey: string | null): void {
  writeLocalStorageValue(
    ACTIVE_SIDEBAR_SPACE_STORAGE_KEY,
    spaceKey,
    null,
    activeSidebarSpaceKeySchema,
  );
}

export function activateSidebarSpace(spaceKey: string | null): void {
  writeActiveSidebarSpaceKey(spaceKey);
  useUiStateStore.getState().setSidebarProjectScopeKeys([]);
  useThreadSelectionStore.getState().clearSelection();
}

export function setSidebarScopeKeysLeavingSpace(keys: readonly string[]): void {
  if (readActiveSidebarSpaceKey() !== null) writeActiveSidebarSpaceKey(null);
  useUiStateStore.getState().setSidebarProjectScopeKeys(keys);
}

export function useSidebarSpacesEnabled(): boolean {
  return useClientSettings((settings) => !settings.boringSidebarEnabled);
}

export function sidebarSpaceGroupsOf(
  groups: ReadonlyArray<SidebarProjectSnapshot>,
): ReadonlyArray<SidebarSpaceProjectGroup & { readonly snapshot: SidebarProjectSnapshot }> {
  return pickableProjectGroups(groups).map((group) => ({
    key: group.projectKey,
    projectRefs: group.memberProjectRefs,
    isScratch: group.isScratch === true,
    snapshot: group,
  }));
}

export function useSidebarSpaceWriter(): {
  canEdit(environmentId: EnvironmentId): boolean;
  save(space: SidebarSpace, homeEnvironmentId: EnvironmentId): Promise<boolean>;
  remove(spaceKey: string): Promise<boolean>;
  move(spaceKey: string, direction: -1 | 1): Promise<boolean>;
} {
  const { environments } = useEnvironments();
  const writableEnvironments = useEnvironmentsWithScope(environments, AuthSettingsWriteScope);
  const persist = useAtomCommand(serverEnvironment.updateSettings, {
    label: "sidebar spaces update",
    reportFailure: false,
  });

  const update = async (
    environmentId: EnvironmentId,
    transform: (spaces: ReadonlyArray<SidebarSpace>) => SidebarSpace[],
  ): Promise<boolean> => {
    const label =
      environments.find((environment) => environment.environmentId === environmentId)?.label ??
      environmentId;
    if (!readEnvironmentScope(environmentId, AuthSettingsWriteScope)) {
      toastManager.add({
        type: "warning",
        title: "Space not saved",
        description: `This connection lacks permission to change settings on ${label}.`,
      });
      return false;
    }
    const settings = appAtomRegistry.get(serverEnvironment.settingsValueAtom(environmentId));
    if (settings === null) {
      toastManager.add({
        type: "warning",
        title: "Space not saved",
        description: `Settings on ${label} are unavailable. Try reconnecting and saving again.`,
      });
      return false;
    }
    const result = await persist({
      environmentId,
      input: { patch: { sidebarSpaces: transform(settings.sidebarSpaces) } },
    });
    if (result._tag === "Failure" && !isAtomCommandInterrupted(result)) {
      const error = squashAtomCommandFailure(result);
      toastManager.add({
        type: "error",
        title: "Space not saved",
        description: `Could not save on ${label}: ${error instanceof Error ? error.message : "The save failed. Try reconnecting and saving again."}`,
      });
    }
    return result._tag === "Success";
  };

  return {
    canEdit: (environmentId) => writableEnvironments.has(environmentId),
    save: (space, homeEnvironmentId) =>
      update(homeEnvironmentId, (spaces) => upsertSidebarSpace(spaces, space)),
    remove: async (spaceKey) => {
      const parsed = parseSidebarSpaceKey(spaceKey);
      return parsed === null
        ? false
        : update(parsed.homeEnvironmentId, (spaces) => removeSidebarSpace(spaces, parsed.spaceId));
    },
    move: async (spaceKey, direction) => {
      const parsed = parseSidebarSpaceKey(spaceKey);
      return parsed === null
        ? false
        : update(parsed.homeEnvironmentId, (spaces) =>
            moveSidebarSpace(spaces, parsed.spaceId, direction),
          );
    },
  };
}
