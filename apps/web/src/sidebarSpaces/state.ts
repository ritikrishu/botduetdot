import { useAtomValue } from "@effect/atom-react";
import { pickableProjectGroups } from "@t3tools/client-runtime/state/project-grouping";
import {
  addSidebarSpaceProjectRefs,
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
import * as Equal from "effect/Equal";
import * as Schema from "effect/Schema";

import { toastManager } from "../components/ui/toast";
import {
  readLocalStorageValue,
  useLocalStorage,
  writeLocalStorageValue,
} from "../hooks/useLocalStorage";
import { useClientSettings } from "../hooks/useSettings";
import { appAtomRegistry, subscribeAtomChanges } from "../rpc/atomRegistry";
import type { SidebarProjectSnapshot } from "../sidebarProjectGrouping";
import { useEnvironments } from "../state/environments";
import { environmentSummaries } from "../state/presentation";
import { primaryEnvironmentIdAtom } from "../state/primaryEnvironment";
import { serverEnvironment } from "../state/server";
import {
  environmentSession,
  readEnvironmentScope,
  useEnvironmentsWithScope,
} from "../state/session";
import { useAtomCommand } from "../state/use-atom-command";
import { useThreadSelectionStore } from "../threadSelectionStore";
import { useUiStateStore } from "../uiStateStore";

const ACTIVE_SIDEBAR_SPACE_STORAGE_KEY = "t3code:sidebar-spaces:active:v1";
const activeSidebarSpaceKeySchema = Schema.NullOr(Schema.String);

const sidebarSpacesAtom = createSidebarSpacesAtom({
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

const sidebarSpaceWriteQueues = new Map<EnvironmentId, Promise<void>>();

function enqueueSidebarSpaceUpdate(
  environmentId: EnvironmentId,
  update: () => Promise<boolean>,
): Promise<boolean> {
  const result = (sidebarSpaceWriteQueues.get(environmentId) ?? Promise.resolve()).then(update);
  const tail = result.then(
    () => undefined,
    () => undefined,
  );
  sidebarSpaceWriteQueues.set(environmentId, tail);
  return result.finally(() => {
    if (sidebarSpaceWriteQueues.get(environmentId) === tail) {
      sidebarSpaceWriteQueues.delete(environmentId);
    }
  });
}

// Settings pushes arrive in server commit order, but a reply can beat or trail its own push and the
// settings atom keeps only the last push of a batch. Writes build on acknowledged lists until echoed.
const SIDEBAR_SPACE_ECHO_WAIT_MS = 15_000;

interface SidebarSpaceEchoWait {
  /** Acknowledged lists the settings stream has not echoed yet, oldest first. */
  unechoed: Array<ReadonlyArray<SidebarSpace>>;
  /** While a write is in flight: pushed lists that echoed none of `unechoed`. */
  inFlight: Array<ReadonlyArray<SidebarSpace>> | null;
  observed: ReadonlyArray<SidebarSpace> | undefined;
  expiresAt: number;
  stop: () => void;
}

const sidebarSpaceEchoWaits = new Map<EnvironmentId, SidebarSpaceEchoWait>();

function settleSidebarSpaceEchoWait(environmentId: EnvironmentId, wait: SidebarSpaceEchoWait) {
  if (wait.inFlight !== null || wait.unechoed.length > 0) return;
  wait.stop();
  sidebarSpaceEchoWaits.delete(environmentId);
}

function sidebarSpaceEchoWait(environmentId: EnvironmentId): SidebarSpaceEchoWait {
  const existing = sidebarSpaceEchoWaits.get(environmentId);
  if (existing !== undefined) return existing;
  const settingsAtom = serverEnvironment.settingsValueAtom(environmentId);
  const wait: SidebarSpaceEchoWait = {
    unechoed: [],
    inFlight: null,
    observed: appAtomRegistry.get(settingsAtom)?.sidebarSpaces,
    expiresAt: 0,
    stop: () => undefined,
  };
  const stopSettings = subscribeAtomChanges(settingsAtom, (settings) => {
    if (settings === null || Equal.equals(settings.sidebarSpaces, wait.observed)) return;
    wait.observed = settings.sidebarSpaces;
    expireOverdueSidebarSpaceEcho(wait);
    // The earliest match: an older acknowledgement can share a later one's list.
    const echoed = wait.unechoed.findIndex((spaces) => Equal.equals(spaces, wait.observed));
    if (echoed >= 0) wait.unechoed.splice(0, echoed + 1);
    else wait.inFlight?.push(settings.sidebarSpaces);
    settleSidebarSpaceEchoWait(environmentId, wait);
  });
  const stopSession = subscribeAtomChanges(
    environmentSession.initialConfigValueAtom(environmentId),
    (config) => {
      if (config === null) return;
      // A new connection's first config holds every write acknowledged before it.
      const fresh = config.settings.sidebarSpaces;
      wait.unechoed = Equal.equals(fresh, wait.observed) ? [] : [fresh];
      wait.expiresAt = Date.now() + SIDEBAR_SPACE_ECHO_WAIT_MS;
      settleSidebarSpaceEchoWait(environmentId, wait);
    },
  );
  wait.stop = () => {
    stopSettings();
    stopSession();
  };
  sidebarSpaceEchoWaits.set(environmentId, wait);
  return wait;
}

function expireOverdueSidebarSpaceEcho(wait: SidebarSpaceEchoWait) {
  // An echo hidden behind a newer push never arrives; stop holding the list once it is overdue.
  if (wait.unechoed.length > 0 && Date.now() >= wait.expiresAt) wait.unechoed = [];
}

async function writeSidebarSpaces(
  environmentId: EnvironmentId,
  current: ReadonlyArray<SidebarSpace>,
  write: (spaces: ReadonlyArray<SidebarSpace>) => Promise<ReadonlyArray<SidebarSpace> | undefined>,
): Promise<boolean> {
  const wait = sidebarSpaceEchoWait(environmentId);
  expireOverdueSidebarSpaceEcho(wait);
  wait.inFlight = [];
  try {
    const acknowledged = await write(wait.unechoed.at(-1) ?? current);
    if (acknowledged === undefined) return false;
    if (wait.inFlight.some((spaces) => Equal.equals(spaces, acknowledged))) {
      wait.unechoed = [];
    } else if (!Equal.equals(acknowledged, wait.unechoed.at(-1) ?? wait.observed)) {
      wait.unechoed.push(acknowledged);
      wait.expiresAt = Date.now() + SIDEBAR_SPACE_ECHO_WAIT_MS;
    }
    return true;
  } finally {
    wait.inFlight = null;
    settleSidebarSpaceEchoWait(environmentId, wait);
  }
}

export function useSidebarSpaceWriter(): {
  canEdit(environmentId: EnvironmentId): boolean;
  save(space: SidebarSpace, homeEnvironmentId: EnvironmentId): Promise<boolean>;
  remove(spaceKey: string): Promise<boolean>;
  move(spaceKey: string, direction: -1 | 1): Promise<boolean>;
  join(spaceKey: string, projectRefs: ReadonlyArray<string>): Promise<boolean>;
} {
  const { environments } = useEnvironments();
  const writableEnvironments = useEnvironmentsWithScope(environments, AuthSettingsWriteScope);
  const persist = useAtomCommand(serverEnvironment.updateSettings, {
    label: "sidebar spaces update",
    reportFailure: false,
  });

  const update = (
    environmentId: EnvironmentId,
    transform: (spaces: ReadonlyArray<SidebarSpace>) => SidebarSpace[],
  ): Promise<boolean> =>
    enqueueSidebarSpaceUpdate(environmentId, async () => {
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
      return writeSidebarSpaces(environmentId, settings.sidebarSpaces, async (spaces) => {
        const result = await persist({
          environmentId,
          input: { patch: { sidebarSpaces: transform(spaces) } },
        });
        if (result._tag === "Success") return result.value.sidebarSpaces;
        if (!isAtomCommandInterrupted(result)) {
          const error = squashAtomCommandFailure(result);
          toastManager.add({
            type: "error",
            title: "Space not saved",
            description: `Could not save on ${label}: ${error instanceof Error ? error.message : "The save failed. Try reconnecting and saving again."}`,
          });
        }
        return undefined;
      });
    });

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
    join: async (spaceKey, projectRefs) => {
      const parsed = parseSidebarSpaceKey(spaceKey);
      return parsed === null
        ? false
        : update(parsed.homeEnvironmentId, (spaces) =>
            addSidebarSpaceProjectRefs(spaces, parsed.spaceId, projectRefs),
          );
    },
  };
}
