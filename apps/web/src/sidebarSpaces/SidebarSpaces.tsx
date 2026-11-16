import { useAtomValue } from "@effect/atom-react";
import { settlePromise } from "@t3tools/client-runtime/state/runtime";
import {
  sidebarSpaceProjectRefKeys,
  sidebarSpacesNeedingAttention,
  type HomedSidebarSpace,
} from "@t3tools/client-runtime/state/sidebar-spaces";
import { isShownUnderParent } from "@t3tools/client-runtime/state/threads";
import { SIDEBAR_SPACE_KEYBINDING_COMMANDS } from "@t3tools/contracts";
import { LayersIcon, PlusIcon } from "lucide-react";
import { memo, type ComponentProps } from "react";

import { resolveSidebarFolderDot } from "../components/Sidebar.logic";
import { Button } from "../components/ui/button";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../components/ui/tooltip";
import { requestConfirmDialog } from "../confirmDialog";
import { shortcutLabelForCommand } from "../keybindings";
import { cn } from "../lib/utils";
import { readLocalApi } from "../localApi";
import type { SidebarProjectSnapshot } from "../sidebarProjectGrouping";
import {
  useAllEnvironmentProjectSnapshotsReady,
  useDelegatedUnderParent,
  useQuietThreadShells,
} from "../state/entities";
import { useEnvironmentIdentities } from "../state/environments";
import { primaryServerKeybindingsAtom } from "../state/server";
import { openSidebarSpaceEditor } from "./editorStore";
import { scrollSidebarListToTop } from "./scrollSidebarListToTop";
import { SidebarSpaceGlyph } from "./SidebarSpaceGlyph";
import {
  activateSidebarSpace,
  readActiveSidebarSpaceKey,
  sidebarSpaceGroupsOf,
  useSidebarSpaces,
  useSidebarSpacesEnabled,
  useSidebarSpaceWriter,
} from "./state";
import { useSidebarSpaceScope } from "./useSidebarSpaceScopeKeys";

function SpaceChip({ dimmed, ...props }: ComponentProps<"button"> & { dimmed?: boolean }) {
  return (
    <button
      {...props}
      type="button"
      className={cn(
        // The selected space reads at a glance by brightness alone: a near-foreground tile in light theme,
        // a muted one in dark (about 3.2:1). Focus is an inset outline, light on the selected tile so it shows.
        "group relative flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-sidebar-muted-foreground hover:bg-sidebar-row-hover focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-solid focus-visible:outline-ring aria-pressed:focus-visible:outline-background dark:aria-pressed:focus-visible:outline-foreground aria-pressed:bg-foreground/90 aria-pressed:text-sidebar-foreground aria-pressed:ring-1 aria-pressed:ring-white/8 aria-pressed:ring-inset aria-pressed:hover:bg-foreground/90 dark:aria-pressed:bg-foreground/38 dark:aria-pressed:ring-black/12 dark:aria-pressed:hover:bg-foreground/38",
        dimmed && "opacity-50",
      )}
    />
  );
}

function selectSpace(spaceKey: string | null) {
  activateSidebarSpace(spaceKey);
  scrollSidebarListToTop();
}

function SidebarSpacesStrip(props: {
  projectGroups: ReadonlyArray<SidebarProjectSnapshot>;
  spaces: ReadonlyArray<HomedSidebarSpace>;
}) {
  const { spaces, projectGroups } = props;
  const scope = useSidebarSpaceScope(projectGroups);
  const threads = useQuietThreadShells();
  const delegatedUnderParent = useDelegatedUnderParent();
  const snapshotsReady = useAllEnvironmentProjectSnapshotsReady();
  const environments = useEnvironmentIdentities();
  const keybindings = useAtomValue(primaryServerKeybindingsAtom);
  const writer = useSidebarSpaceWriter();
  const groups = sidebarSpaceGroupsOf(projectGroups);
  const attention = sidebarSpacesNeedingAttention({
    spaces: spaces.map((space) => ({
      key: space.key,
      projectRefKeys: sidebarSpaceProjectRefKeys(space.space, groups),
    })),
    threads,
    isListed: (thread) =>
      thread.archivedAt === null &&
      !isShownUnderParent(
        { environmentId: thread.environmentId, threadId: thread.id },
        thread.lineage,
        delegatedUnderParent,
      ),
    needsYou: (thread) => resolveSidebarFolderDot([thread]) === "attention",
  });
  const multipleHomes = new Set(spaces.map((space) => space.homeEnvironmentId)).size > 1;
  const allShortcut = shortcutLabelForCommand(keybindings, "sidebar.space.all");

  async function showSpaceMenu(space: HomedSidebarSpace, position: { x: number; y: number }) {
    const api = readLocalApi();
    if (!api || !writer.canEdit(space.homeEnvironmentId)) return;
    const homeSpaces = spaces.filter(
      (entry) => entry.homeEnvironmentId === space.homeEnvironmentId,
    );
    const index = homeSpaces.findIndex((entry) => entry.key === space.key);
    const clicked = await settlePromise(() =>
      api.contextMenu.show(
        [
          { id: "edit", label: "Edit…" },
          { id: "left", label: "Move left", disabled: index === 0 },
          { id: "right", label: "Move right", disabled: index === homeSpaces.length - 1 },
          { id: "delete", label: "Delete…", destructive: true, separatorBefore: true },
        ],
        position,
      ),
    );
    if (clicked._tag === "Failure") return;
    switch (clicked.value) {
      case "edit":
        openSidebarSpaceEditor({ mode: "edit", spaceKey: space.key });
        break;
      case "left":
        await writer.move(space.key, -1);
        break;
      case "right":
        await writer.move(space.key, 1);
        break;
      case "delete":
        if (
          !(await requestConfirmDialog(`Delete space “${space.space.name}”?`, {
            variant: "destructive",
          }))
        )
          return;
        if (await writer.remove(space.key)) {
          if (readActiveSidebarSpaceKey() === space.key) activateSidebarSpace(null);
        }
        break;
    }
  }

  return (
    <div
      role="group"
      aria-label="Sidebar spaces"
      className="flex shrink-0 items-center gap-1 overflow-x-auto px-2 py-1"
    >
      <Tooltip>
        <TooltipTrigger
          render={
            <SpaceChip
              aria-label="All projects"
              aria-pressed={scope.selection.kind === "all"}
              onClick={() => selectSpace(null)}
            />
          }
        >
          <LayersIcon className="size-4" aria-hidden="true" />
        </TooltipTrigger>
        <TooltipPopup>All{allShortcut ? ` (${allShortcut})` : ""}</TooltipPopup>
      </Tooltip>
      {spaces.map((space, index) => {
        const selected = scope.selection.kind === "space" && scope.selection.spaceKey === space.key;
        const dimmed = scope.unresolvedSpaceKey === space.key;
        const needsYou = !selected && attention.has(space.key);
        const command = SIDEBAR_SPACE_KEYBINDING_COMMANDS.find(
          (entry) => entry === `sidebar.space.${index + 1}`,
        );
        const shortcut = shortcutLabelForCommand(keybindings, command ?? null);
        const homeLabel =
          environments.find((entry) => entry.environmentId === space.homeEnvironmentId)?.label ??
          space.homeEnvironmentId;
        const tooltip = `${space.space.name}${shortcut ? ` (${shortcut})` : ""}${multipleHomes ? ` (${homeLabel})` : ""}${dimmed && snapshotsReady ? ": None of this space's projects are connected" : ""}`;
        return (
          <Tooltip key={space.key}>
            <TooltipTrigger
              render={
                <SpaceChip
                  aria-label={`${space.space.name}${needsYou ? ", needs you" : ""}${dimmed && snapshotsReady ? ", not connected" : ""}`}
                  aria-pressed={selected}
                  dimmed={dimmed}
                  onClick={() => selectSpace(space.key)}
                  onKeyDown={(event) => {
                    if (event.key !== "ContextMenu" && !(event.shiftKey && event.key === "F10"))
                      return;
                    event.preventDefault();
                    event.stopPropagation();
                    const rect = event.currentTarget.getBoundingClientRect();
                    void showSpaceMenu(space, { x: rect.left, y: rect.bottom });
                  }}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    void showSpaceMenu(space, { x: event.clientX, y: event.clientY });
                  }}
                />
              }
            >
              <SidebarSpaceGlyph
                icon={space.space.icon}
                name={space.space.name}
                className={cn(
                  "size-4 text-sm leading-4",
                  // Emoji ignore text colour, so unselected glyphs dim to let the selected one stand out.
                  !selected &&
                    "opacity-80 grayscale-60 group-hover:opacity-100 group-hover:grayscale-0 dark:opacity-60 dark:group-hover:opacity-100",
                )}
              />
              {needsYou ? (
                <span
                  aria-hidden="true"
                  className="absolute right-0.5 top-0.5 size-1.5 rounded-full bg-warning"
                />
              ) : null}
            </TooltipTrigger>
            <TooltipPopup>{tooltip}</TooltipPopup>
          </Tooltip>
        );
      })}
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              size="icon-sm"
              variant="ghost-muted"
              aria-label="Create space"
              onClick={() => openSidebarSpaceEditor({ mode: "create" })}
            />
          }
        >
          <PlusIcon aria-hidden="true" />
        </TooltipTrigger>
        <TooltipPopup>Create space…</TooltipPopup>
      </Tooltip>
    </div>
  );
}

export const SidebarSpaces = memo(function SidebarSpaces(props: {
  projectGroups: ReadonlyArray<SidebarProjectSnapshot>;
}) {
  const enabled = useSidebarSpacesEnabled();
  const spaces = useSidebarSpaces();
  return enabled && spaces.length > 0 ? <SidebarSpacesStrip {...props} spaces={spaces} /> : null;
});
