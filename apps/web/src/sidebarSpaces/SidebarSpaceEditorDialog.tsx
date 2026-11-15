import { useEffect, useId, useState } from "react";
import {
  findSidebarSpace,
  homeEnvironmentForNewSidebarSpace,
  resolveSidebarSpaceGroups,
  sidebarSpaceKey,
  sidebarSpaceProjectRefs,
} from "@t3tools/client-runtime/state/sidebar-spaces";
import { SIDEBAR_SPACE_NAME_MAX_LENGTH } from "@t3tools/contracts";
import { Button } from "../components/ui/button";
import { Checkbox } from "../components/ui/checkbox";
import {
  Dialog,
  DialogPopup,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogPanel,
  DialogFooter,
} from "../components/ui/dialog";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { ProjectFavicon } from "../components/ProjectFavicon";
import { randomUUID } from "../lib/utils";
import { requestConfirmDialog } from "../confirmDialog";
import { useSidebarProjectGroups } from "../hooks/useSidebarProjectGroups";
import { usePrimaryEnvironmentId } from "../state/environments";
import type { SidebarSpaceEditorRequest } from "./editorStore";
import { SIDEBAR_SPACE_LUCIDE_ICONS, SidebarSpaceGlyph } from "./SidebarSpaceGlyph";
import {
  activateSidebarSpace,
  readActiveSidebarSpaceKey,
  sidebarSpaceGroupsOf,
  useSidebarSpaces,
  useSidebarSpaceWriter,
} from "./state";

export function SidebarSpaceEditorDialog(props: {
  request: SidebarSpaceEditorRequest;
  onClose(): void;
}) {
  return (
    <SpaceEditorForm
      key={props.request.mode === "edit" ? props.request.spaceKey : "create"}
      {...props}
    />
  );
}

function SpaceEditorForm({
  request,
  onClose,
}: {
  request: SidebarSpaceEditorRequest;
  onClose(): void;
}) {
  const spaces = useSidebarSpaces();
  const primaryEnvironmentId = usePrimaryEnvironmentId();
  const existing = request.mode === "edit" ? findSidebarSpace(spaces, request.spaceKey) : null;
  const missing = request.mode === "edit" && existing === null;
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- dismisses the external editor request when its server-backed space disappears
  useEffect(() => {
    if (missing) onClose();
  }, [missing, onClose]);
  const shownGroups = sidebarSpaceGroupsOf(useSidebarProjectGroups());
  const writer = useSidebarSpaceWriter();
  const home =
    existing?.homeEnvironmentId ?? homeEnvironmentForNewSidebarSpace(spaces, primaryEnvironmentId);
  const editable = home !== null && writer.canEdit(home);
  const [name, setName] = useState(existing?.space.name ?? "");
  const [icon, setIcon] = useState(existing?.space.icon ?? "lucide:folder");
  const [selectionChanges, setSelectionChanges] = useState<ReadonlyMap<string, boolean>>(
    () => new Map(),
  );
  const [busy, setBusy] = useState(false);
  const id = useId();
  const initialKeys = new Set(
    existing !== null
      ? resolveSidebarSpaceGroups(existing.space, shownGroups).map((group) => group.key)
      : request.mode === "create"
        ? request.initialGroupKeys
        : [],
  );
  const selectedGroups = shownGroups.filter(
    (group) => selectionChanges.get(group.key) ?? initialKeys.has(group.key),
  );
  const selectedKeys = new Set(selectedGroups.map((group) => group.key));
  const projectRefs = sidebarSpaceProjectRefs({
    previousRefs: existing?.space.projectRefs ?? [],
    shownGroups,
    selectedGroups,
  });
  const trimmedName = name.trim();
  const trimmedIcon = icon.trim();
  const iconValid =
    trimmedIcon.length > 0 &&
    trimmedIcon.length <= 64 &&
    (trimmedIcon.startsWith("lucide:") ||
      Array.from(new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(trimmedIcon))
        .length <= 2);
  const canSave =
    !missing &&
    editable &&
    !busy &&
    trimmedName.length > 0 &&
    trimmedName.length <= SIDEBAR_SPACE_NAME_MAX_LENGTH &&
    iconValid &&
    projectRefs.length > 0;
  if (missing) return null;

  const save = async () => {
    if (!canSave || home === null) return;
    setBusy(true);
    const spaceId = existing?.space.id ?? randomUUID();
    const saved = await writer
      .save({ id: spaceId, name: trimmedName, icon: trimmedIcon, projectRefs }, home)
      .catch(() => false);
    setBusy(false);
    if (!saved) return;
    if (request.mode === "create") activateSidebarSpace(sidebarSpaceKey(home, spaceId));
    onClose();
  };
  const remove = async () => {
    if (existing === null || !editable || busy) return;
    setBusy(true);
    const confirmed = await requestConfirmDialog(
      `Delete space “${existing.space.name}”? Projects and threads will be kept.`,
      { variant: "destructive" },
    )?.catch(() => false);
    const removed = confirmed && (await writer.remove(existing.key).catch(() => false));
    setBusy(false);
    if (!removed) return;
    if (readActiveSidebarSpaceKey() === existing.key) activateSidebarSpace(null);
    onClose();
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogPopup>
        <form
          className="flex min-h-0 flex-col"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <DialogHeader>
            <DialogTitle>{request.mode === "create" ? "Create space" : "Edit space"}</DialogTitle>
            <DialogDescription>
              Save a set of projects to switch between in the sidebar.
            </DialogDescription>
          </DialogHeader>
          <DialogPanel>
            <div className="flex flex-col gap-4">
              {!editable ? (
                <p role="status" className="text-sm text-muted-foreground">
                  {home === null
                    ? "Connect to an environment to save a space."
                    : "This space is read-only. This connection needs permission to change settings."}
                </p>
              ) : null}
              <div className="flex flex-col gap-2">
                <Label htmlFor={`${id}-name`}>Name</Label>
                <Input
                  id={`${id}-name`}
                  required
                  maxLength={SIDEBAR_SPACE_NAME_MAX_LENGTH}
                  value={name}
                  disabled={!editable || busy}
                  onChange={(event) => setName(event.target.value)}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor={`${id}-emoji`}>Emoji (up to two)</Label>
                <Input
                  id={`${id}-emoji`}
                  value={icon.startsWith("lucide:") ? "" : icon}
                  disabled={!editable || busy}
                  onChange={(event) =>
                    setIcon(
                      Array.from(
                        new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(
                          event.target.value,
                        ),
                        (part) => part.segment,
                      )
                        .slice(0, 2)
                        .join(""),
                    )
                  }
                />
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <SidebarSpaceGlyph icon={icon} name={name} className="size-4" />
                  Or choose an icon
                </div>
                <div role="group" aria-label="Space icon" className="flex flex-wrap gap-1">
                  {Object.entries(SIDEBAR_SPACE_LUCIDE_ICONS).map(([key, Icon]) => (
                    <Button
                      key={key}
                      type="button"
                      size="icon"
                      variant={icon === `lucide:${key}` ? "secondary" : "ghost"}
                      aria-label={key.replaceAll("-", " ")}
                      aria-pressed={icon === `lucide:${key}`}
                      disabled={!editable || busy}
                      onClick={() => setIcon(`lucide:${key}`)}
                    >
                      <Icon />
                    </Button>
                  ))}
                </div>
              </div>
              <fieldset disabled={!editable || busy} className="flex flex-col gap-2">
                <legend className="mb-2 text-sm font-medium">Projects</legend>
                <div className="flex max-h-60 flex-col gap-2 overflow-y-auto">
                  {shownGroups.map((group, index) => (
                    <div key={group.key} className="flex items-center gap-2">
                      <Checkbox
                        id={`${id}-project-${index}`}
                        disabled={!editable || busy}
                        checked={selectedKeys.has(group.key)}
                        onCheckedChange={(checked) =>
                          setSelectionChanges((previous) =>
                            new Map(previous).set(group.key, checked),
                          )
                        }
                      />
                      <ProjectFavicon project={group.snapshot} className="size-4 shrink-0" />
                      <Label htmlFor={`${id}-project-${index}`}>{group.snapshot.displayName}</Label>
                    </div>
                  ))}
                </div>
                {shownGroups.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No projects are available.</p>
                ) : null}
                {projectRefs.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Select at least one project.</p>
                ) : null}
              </fieldset>
            </div>
          </DialogPanel>
          <DialogFooter>
            {existing !== null ? (
              <div className="mr-auto">
                <Button
                  type="button"
                  variant="destructive-outline"
                  disabled={!editable || busy}
                  onClick={() => {
                    void remove();
                  }}
                >
                  Delete space
                </Button>
              </div>
            ) : null}
            <Button type="button" variant="outline" disabled={busy} onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!canSave}>
              {busy ? "Saving…" : "Save space"}
            </Button>
          </DialogFooter>
        </form>
      </DialogPopup>
    </Dialog>
  );
}
