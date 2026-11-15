import { useAtomValue } from "@effect/atom-react";
import { createSidebarSpacesAtom } from "@t3tools/client-runtime/state/sidebar-spaces";
import { Atom } from "effect/reactivity";
import * as SecureStore from "expo-secure-store";
import { useEffect } from "react";
import { whenProtectedDataAvailable } from "../../../lib/protectedData";
import { appAtomRegistry } from "../../../state/atom-registry";
import { connectedEnvironmentIdsAtom } from "../../../state/presentation";
import { serverEnvironment } from "../../../state/server";
import { createActiveSpaceKeyStore } from "./activeSpaceKeyStore";

const storageKey = "t3code.sidebar-spaces.active.v1";
const mobileSidebarSpacesAtom = createSidebarSpacesAtom({
  environmentIdsAtom: connectedEnvironmentIdsAtom,
  settingsValueAtom: serverEnvironment.settingsValueAtom,
});
export const activeMobileSidebarSpaceKeyAtom = Atom.make<string | null>(null).pipe(Atom.keepAlive);
const activeSpaceKeyStore = createActiveSpaceKeyStore({
  read: async () => {
    await whenProtectedDataAvailable();
    return SecureStore.getItemAsync(storageKey);
  },
  write: (key) =>
    key === null
      ? SecureStore.deleteItemAsync(storageKey)
      : SecureStore.setItemAsync(storageKey, key),
  publish: (key) => appAtomRegistry.set(activeMobileSidebarSpaceKeyAtom, key),
});

export function setActiveMobileSidebarSpaceKey(key: string | null): void {
  activeSpaceKeyStore.set(key);
}

export function useMobileSidebarSpaces() {
  return useAtomValue(mobileSidebarSpacesAtom);
}

export function useActiveMobileSidebarSpaceKey(): string | null {
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- loads the per-device active space from SecureStore
  useEffect(() => {
    void activeSpaceKeyStore.hydrate();
  }, []);
  return useAtomValue(activeMobileSidebarSpaceKeyAtom);
}
