import {
  EnvironmentId,
  SIDEBAR_SPACE_SCRATCH_REF,
  type ScopedProjectRef,
  type ServerSettings,
  type SidebarSpace,
} from "@t3tools/contracts";
import * as Equal from "effect/Equal";
import { Atom } from "effect/reactivity";

import { scopedProjectKey } from "../environment/scoped.ts";
import type { EnvironmentProject } from "./models.ts";

export type { SidebarSpace } from "@t3tools/contracts";

export interface HomedSidebarSpace {
  readonly key: string;
  readonly space: SidebarSpace;
  readonly homeEnvironmentId: EnvironmentId;
}

export function sidebarSpaceKey(homeEnvironmentId: EnvironmentId, spaceId: string): string {
  return `${homeEnvironmentId}:${spaceId}`;
}

export function parseSidebarSpaceKey(
  key: string,
): { readonly homeEnvironmentId: EnvironmentId; readonly spaceId: string } | null {
  const separator = key.indexOf(":");
  if (separator <= 0 || separator === key.length - 1) return null;
  return {
    homeEnvironmentId: EnvironmentId.make(key.slice(0, separator)),
    spaceId: key.slice(separator + 1),
  };
}

export interface SidebarSpaceProjectGroup {
  readonly key: string;
  readonly projectRefs: ReadonlyArray<ScopedProjectRef>;
  readonly isScratch: boolean;
}

export function collectSidebarSpaces(input: {
  readonly sources: ReadonlyArray<{
    readonly environmentId: EnvironmentId;
    readonly spaces: ReadonlyArray<SidebarSpace>;
  }>;
  readonly preferredEnvironmentId: EnvironmentId | null;
}): ReadonlyArray<HomedSidebarSpace> {
  const sources = [
    ...input.sources.filter((source) => source.environmentId === input.preferredEnvironmentId),
    ...input.sources.filter((source) => source.environmentId !== input.preferredEnvironmentId),
  ];
  const seen = new Set<string>();
  const result: HomedSidebarSpace[] = [];
  for (const { environmentId, spaces } of sources) {
    for (const space of spaces) {
      const key = sidebarSpaceKey(environmentId, space.id);
      if (seen.has(key)) continue;
      seen.add(key);
      result.push({ key, space, homeEnvironmentId: environmentId });
    }
  }
  return result;
}

export function createSidebarSpacesAtom(input: {
  readonly environmentIdsAtom: Atom.Atom<ReadonlyArray<EnvironmentId>>;
  readonly settingsValueAtom: (environmentId: EnvironmentId) => Atom.Atom<ServerSettings | null>;
  readonly preferredEnvironmentIdAtom?: Atom.Atom<EnvironmentId | null>;
}): Atom.Atom<ReadonlyArray<HomedSidebarSpace>> {
  return Atom.make((get) =>
    collectSidebarSpaces({
      sources: get(input.environmentIdsAtom).map((environmentId) => ({
        environmentId,
        spaces: get(input.settingsValueAtom(environmentId))?.sidebarSpaces ?? [],
      })),
      preferredEnvironmentId: input.preferredEnvironmentIdAtom
        ? get(input.preferredEnvironmentIdAtom)
        : null,
    }),
  ).pipe(Atom.withEquality(Equal.equals));
}

export function findSidebarSpace(
  spaces: ReadonlyArray<HomedSidebarSpace>,
  spaceKey: string | null,
): HomedSidebarSpace | null {
  return spaces.find((space) => space.key === spaceKey) ?? null;
}

export function resolveSidebarSpaceGroups<G extends SidebarSpaceProjectGroup>(
  space: Pick<SidebarSpace, "projectRefs">,
  groups: ReadonlyArray<G>,
): G[] {
  const refs = new Set(space.projectRefs);
  return groups.filter(
    (group) =>
      (group.isScratch && refs.has(SIDEBAR_SPACE_SCRATCH_REF)) ||
      group.projectRefs.some((ref) => refs.has(scopedProjectKey(ref))),
  );
}

export function sidebarSpaceProjectRefKeys(
  space: Pick<SidebarSpace, "projectRefs">,
  groups: ReadonlyArray<SidebarSpaceProjectGroup>,
): ReadonlySet<string> {
  return new Set(
    resolveSidebarSpaceGroups(space, groups).flatMap((group) =>
      group.projectRefs.map(scopedProjectKey),
    ),
  );
}

export function sidebarSpaceProjectRefs(input: {
  readonly previousRefs: ReadonlyArray<string>;
  readonly shownGroups: ReadonlyArray<SidebarSpaceProjectGroup>;
  readonly selectedGroups: ReadonlyArray<SidebarSpaceProjectGroup>;
}): string[] {
  const claimed = new Set<string>();
  for (const group of input.shownGroups) {
    for (const ref of group.projectRefs) claimed.add(scopedProjectKey(ref));
    if (group.isScratch) claimed.add(SIDEBAR_SPACE_SCRATCH_REF);
  }
  const previous = new Set(input.previousRefs);
  const keep = new Set<string>();
  for (const group of input.selectedGroups) {
    if (group.isScratch) {
      keep.add(SIDEBAR_SPACE_SCRATCH_REF);
      continue;
    }
    const refs = group.projectRefs.map(scopedProjectKey);
    // A no-op save in a coarser grouping must not restore previously removed members.
    const had = refs.filter((ref) => previous.has(ref));
    for (const ref of had.length > 0 ? had : refs) keep.add(ref);
  }
  return [
    ...new Set([
      ...input.previousRefs.filter((ref) => !claimed.has(ref) || keep.has(ref)),
      ...keep,
    ]),
  ];
}

export type SidebarSpaceSelection =
  | { readonly kind: "all" }
  | { readonly kind: "custom" }
  | { readonly kind: "space"; readonly spaceKey: string };

export interface SidebarSpaceScope<G extends SidebarSpaceProjectGroup> {
  readonly activeSpace: HomedSidebarSpace | null;
  readonly spaceGroups: ReadonlyArray<G> | null;
  readonly selection: SidebarSpaceSelection;
  readonly unresolvedSpaceKey: string | null;
  readonly detachOnWrite: boolean;
}

export function resolveSidebarSpaceScope<G extends SidebarSpaceProjectGroup>(input: {
  readonly enabled: boolean;
  readonly spaces: ReadonlyArray<HomedSidebarSpace>;
  readonly activeSpaceKey: string | null;
  readonly groups: ReadonlyArray<G>;
  readonly hasManualFilter: boolean;
}): SidebarSpaceScope<G> {
  const activeSpace = findSidebarSpace(input.spaces, input.activeSpaceKey);
  const detachOnWrite = input.enabled && input.activeSpaceKey !== null;
  if (!input.enabled || activeSpace === null) {
    return {
      activeSpace,
      spaceGroups: null,
      selection: { kind: input.hasManualFilter ? "custom" : "all" },
      unresolvedSpaceKey: null,
      detachOnWrite,
    };
  }
  const spaceGroups = resolveSidebarSpaceGroups(activeSpace.space, input.groups);
  const resolved = spaceGroups.length > 0;
  return {
    activeSpace,
    spaceGroups,
    selection: resolved ? { kind: "space", spaceKey: activeSpace.key } : { kind: "all" },
    unresolvedSpaceKey: resolved ? null : activeSpace.key,
    detachOnWrite,
  };
}

export function sidebarSpacesNeedingAttention<
  T extends { readonly environmentId: string; readonly projectId: string },
>(input: {
  readonly spaces: ReadonlyArray<{
    readonly key: string;
    readonly projectRefKeys: ReadonlySet<string>;
  }>;
  readonly threads: ReadonlyArray<T>;
  readonly isListed: (thread: T) => boolean;
  readonly needsYou: (thread: T) => boolean;
}): ReadonlySet<string> {
  const needingAttention = new Set<string>();
  for (const thread of input.threads) {
    if (input.isListed(thread) && input.needsYou(thread)) {
      needingAttention.add(`${thread.environmentId}:${thread.projectId}`);
    }
  }
  return new Set(
    input.spaces
      .filter((space) => [...space.projectRefKeys].some((ref) => needingAttention.has(ref)))
      .map((space) => space.key),
  );
}

export const SIDEBAR_SPACE_SLOT_COUNT = 9;

export function resolveSidebarSpaceCommand(input: {
  readonly command: string;
  readonly spaceKeys: ReadonlyArray<string>;
  readonly activeSpaceKey: string | null;
}): { readonly spaceKey: string | null } | null {
  if (input.command === "sidebar.space.all") return { spaceKey: null };
  if (input.command === "sidebar.space.next" || input.command === "sidebar.space.previous") {
    if (input.spaceKeys.length === 0) return null;
    const current =
      input.activeSpaceKey === null ? 0 : input.spaceKeys.indexOf(input.activeSpaceKey) + 1;
    const count = input.spaceKeys.length + 1;
    const direction = input.command === "sidebar.space.next" ? 1 : -1;
    const next = (current + direction + count) % count;
    return { spaceKey: next === 0 ? null : input.spaceKeys[next - 1]! };
  }
  const slot = /^sidebar\.space\.([1-9])$/.exec(input.command)?.[1];
  const spaceKey = slot === undefined ? undefined : input.spaceKeys[Number(slot) - 1];
  return spaceKey === undefined ? null : { spaceKey };
}

// A project counts as created in the active space only if it is this recent when it first appears;
// older ones that appear after a reconnect or a newly paired environment stay where they were.
const JOIN_ACTIVE_SPACE_WINDOW_MS = 10 * 60_000;

/**
 * Projects created while a space is active join it, as an Arc tab stays in the space it was opened
 * in. Scratch never joins, because its ref brings in every scratch thread.
 */
export function projectRefsJoiningActiveSpace(input: {
  readonly known: ReadonlySet<string>;
  readonly projects: ReadonlyArray<
    Pick<EnvironmentProject, "environmentId" | "id" | "createdAt" | "isScratch">
  >;
  readonly space: Pick<SidebarSpace, "projectRefs">;
  readonly now: number;
}): string[] {
  const members = new Set(input.space.projectRefs);
  return input.projects.flatMap((project) => {
    const key = scopedProjectKey({ environmentId: project.environmentId, projectId: project.id });
    const fresh = input.now - Date.parse(project.createdAt) <= JOIN_ACTIVE_SPACE_WINDOW_MS;
    return input.known.has(key) || members.has(key) || project.isScratch === true || !fresh
      ? []
      : [key];
  });
}

export function addSidebarSpaceProjectRefs(
  spaces: ReadonlyArray<SidebarSpace>,
  spaceId: string,
  refs: ReadonlyArray<string>,
): SidebarSpace[] {
  return spaces.map((space) =>
    space.id === spaceId
      ? { ...space, projectRefs: [...new Set([...space.projectRefs, ...refs])] }
      : space,
  );
}

export function homeEnvironmentForNewSidebarSpace(
  spaces: ReadonlyArray<HomedSidebarSpace>,
  primaryEnvironmentId: EnvironmentId | null,
): EnvironmentId | null {
  return spaces[0]?.homeEnvironmentId ?? primaryEnvironmentId;
}

function uniqueSidebarSpaces(spaces: ReadonlyArray<SidebarSpace>): SidebarSpace[] {
  const seen = new Set<string>();
  return spaces.filter((space) => {
    if (seen.has(space.id)) return false;
    seen.add(space.id);
    return true;
  });
}

export function upsertSidebarSpace(
  spaces: ReadonlyArray<SidebarSpace>,
  space: SidebarSpace,
): SidebarSpace[] {
  const result = uniqueSidebarSpaces(spaces);
  const index = result.findIndex((candidate) => candidate.id === space.id);
  if (index === -1) result.push(space);
  else result[index] = space;
  return result;
}

export function removeSidebarSpace(
  spaces: ReadonlyArray<SidebarSpace>,
  spaceId: string,
): SidebarSpace[] {
  return uniqueSidebarSpaces(spaces).filter((space) => space.id !== spaceId);
}

export function moveSidebarSpace(
  spaces: ReadonlyArray<SidebarSpace>,
  spaceId: string,
  direction: -1 | 1,
): SidebarSpace[] {
  const result = uniqueSidebarSpaces(spaces);
  const index = result.findIndex((space) => space.id === spaceId);
  const target = index + direction;
  if (index !== -1 && target >= 0 && target < result.length) {
    [result[index], result[target]] = [result[target]!, result[index]!];
  }
  return result;
}

export function sidebarSpaceIconParts(
  icon: string,
):
  | { readonly kind: "lucide"; readonly name: string }
  | { readonly kind: "text"; readonly text: string } {
  return icon.startsWith("lucide:")
    ? { kind: "lucide", name: icon.slice("lucide:".length) }
    : { kind: "text", text: icon };
}

// Hermes has no Intl.Segmenter: keep combining marks, emoji modifiers/variation selectors and ZWJ joins.
const GRAPHEME_EXTEND = String.raw`(?:\p{M}|[\u{1F3FB}-\u{1F3FF}]|︎|️|[\u{E0020}-\u{E007F}])*`;
const FIRST_GRAPHEME = new RegExp(
  String.raw`^(?:[\u{1F1E6}-\u{1F1FF}]{2}|[\s\S]${GRAPHEME_EXTEND}(?:‍[\s\S]${GRAPHEME_EXTEND})*)`,
  "u",
);

export function sidebarSpaceMonogram(name: string): string {
  return FIRST_GRAPHEME.exec(name)?.[0].toUpperCase() ?? "";
}
