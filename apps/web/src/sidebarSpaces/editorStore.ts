import { useSyncExternalStore } from "react";

export type SidebarSpaceEditorRequest =
  | { mode: "create"; initialGroupKeys?: ReadonlyArray<string> }
  | { mode: "edit"; spaceKey: string };

let request: SidebarSpaceEditorRequest | null = null;
const listeners = new Set<() => void>();

function publish(next: SidebarSpaceEditorRequest | null): void {
  if (request === next) return;
  request = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): SidebarSpaceEditorRequest | null {
  return request;
}

export function openSidebarSpaceEditor(next: SidebarSpaceEditorRequest): void {
  publish(next);
}

export function closeSidebarSpaceEditor(): void {
  publish(null);
}

export function useSidebarSpaceEditorRequest(): SidebarSpaceEditorRequest | null {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
