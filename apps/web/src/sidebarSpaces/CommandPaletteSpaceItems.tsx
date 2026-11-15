import {
  findSidebarSpace,
  resolveSidebarSpaceScope,
  sidebarSpaceProjectRefKeys,
  sidebarSpacesNeedingAttention,
} from "@t3tools/client-runtime/state/sidebar-spaces";
import { SIDEBAR_SPACE_KEYBINDING_COMMANDS } from "@t3tools/contracts";
import { LayersIcon, PencilIcon, PlusIcon, SaveIcon } from "lucide-react";
import {
  ITEM_ICON_CLASS,
  ADDON_ICON_CLASS,
  type CommandPaletteActionItem,
  type CommandPaletteSubmenuItem,
} from "../components/CommandPalette.logic";
import {
  filterSidebarV2VisibleThreads,
  resolveSidebarFolderDot,
} from "../components/Sidebar.logic";
import { useSidebarProjectGroups } from "../hooks/useSidebarProjectGroups";
import { useDelegatedUnderParent, useQuietThreadShells } from "../state/entities";
import { useEnvironmentIdentities } from "../state/environments";
import { useUiStateStore } from "../uiStateStore";
import { openSidebarSpaceEditor } from "./editorStore";
import { SidebarSpaceGlyph } from "./SidebarSpaceGlyph";
import {
  activateSidebarSpace,
  sidebarSpaceGroupsOf,
  useActiveSidebarSpaceKey,
  useSidebarSpaces,
  useSidebarSpacesEnabled,
} from "./state";

export function useCommandPaletteSpaceItems(): ReadonlyArray<
  CommandPaletteActionItem | CommandPaletteSubmenuItem
> {
  const enabled = useSidebarSpacesEnabled();
  const spaces = useSidebarSpaces();
  const activeSpaceKey = useActiveSidebarSpaceKey();
  const manualKeys = useUiStateStore((state) => state.sidebarProjectScopeKeys);
  const groups = sidebarSpaceGroupsOf(useSidebarProjectGroups());
  const threads = useQuietThreadShells();
  const delegated = useDelegatedUnderParent();
  const environments = useEnvironmentIdentities();
  if (!enabled) return [];
  const activeSpace = findSidebarSpace(spaces, activeSpaceKey);
  const scope = resolveSidebarSpaceScope({
    enabled,
    spaces,
    activeSpaceKey,
    groups,
    hasManualFilter: manualKeys.length > 0,
  });
  const attention = sidebarSpacesNeedingAttention({
    spaces: spaces.map((space) => ({
      key: space.key,
      projectRefKeys: sidebarSpaceProjectRefKeys(space.space, groups),
    })),
    threads: filterSidebarV2VisibleThreads(threads, null, delegated),
    isListed: () => true,
    needsYou: (thread) => resolveSidebarFolderDot([thread]) === "attention",
  });
  const items: Array<CommandPaletteActionItem | CommandPaletteSubmenuItem> = [];
  if (spaces.length > 0)
    items.push({
      kind: "submenu",
      value: "action:sidebar-space:switch",
      title: "Switch space…",
      searchTerms: ["switch", "space", "sidebar"],
      icon: <LayersIcon className={ITEM_ICON_CLASS} />,
      addonIcon: <LayersIcon className={ADDON_ICON_CLASS} />,
      groups: [
        {
          value: "sidebar-spaces",
          label: "Switch space",
          items: [
            {
              kind: "action",
              value: "action:sidebar-space:activate:all",
              title: "All",
              searchTerms: ["all", "spaces"],
              icon: <LayersIcon className={ITEM_ICON_CLASS} />,
              shortcutCommand: "sidebar.space.all",
              run: async () => {
                activateSidebarSpace(null);
              },
            },
            ...spaces.map((space, index): CommandPaletteActionItem => ({
              kind: "action",
              value: `action:sidebar-space:activate:${space.key}`,
              title: space.space.name,
              searchTerms: [space.space.name, "space"],
              description: environments.find(
                (environment) => environment.environmentId === space.homeEnvironmentId,
              )?.label,
              icon: (
                <SidebarSpaceGlyph
                  icon={space.space.icon}
                  name={space.space.name}
                  className={ITEM_ICON_CLASS}
                />
              ),
              ...(SIDEBAR_SPACE_KEYBINDING_COMMANDS[index + 3] === undefined
                ? {}
                : { shortcutCommand: SIDEBAR_SPACE_KEYBINDING_COMMANDS[index + 3]! }),
              titleTrailingContent: (
                <span className="flex items-center gap-2">
                  {activeSpace?.key === space.key ? (
                    <span className="text-xs text-muted-foreground/70">Current</span>
                  ) : null}
                  {attention.has(space.key) &&
                  !(scope.selection.kind === "space" && scope.selection.spaceKey === space.key) ? (
                    <span
                      role="img"
                      aria-label="Needs you"
                      className="size-1.5 rounded-full bg-warning"
                    />
                  ) : null}
                </span>
              ),
              run: async () => {
                activateSidebarSpace(space.key);
              },
            })),
          ],
        },
      ],
    });
  items.push({
    kind: "action",
    value: "action:sidebar-space:create",
    title: "Create space…",
    searchTerms: ["create", "space", "sidebar"],
    icon: <PlusIcon className={ITEM_ICON_CLASS} />,
    run: async () => {
      openSidebarSpaceEditor({ mode: "create" });
    },
  });
  if (activeSpace === null && manualKeys.length > 0)
    items.push({
      kind: "action",
      value: "action:sidebar-space:save-filter",
      title: "Save filter as space…",
      searchTerms: ["save", "filter", "space"],
      icon: <SaveIcon className={ITEM_ICON_CLASS} />,
      run: async () => {
        openSidebarSpaceEditor({ mode: "create", initialGroupKeys: manualKeys });
      },
    });
  if (activeSpace !== null)
    items.push({
      kind: "action",
      value: "action:sidebar-space:edit",
      title: `Edit space: ${activeSpace.space.name}…`,
      searchTerms: ["edit", "space", activeSpace.space.name],
      icon: <PencilIcon className={ITEM_ICON_CLASS} />,
      run: async () => {
        openSidebarSpaceEditor({ mode: "edit", spaceKey: activeSpace.key });
      },
    });
  return items;
}
