import { useAtomValue } from "@effect/atom-react";
import { scopedProjectKey } from "@t3tools/client-runtime/environment";
import {
  findSidebarSpace,
  projectRefsJoiningActiveSpace,
} from "@t3tools/client-runtime/state/sidebar-spaces";
import { useEffect, useRef } from "react";

import { useProjects } from "../state/entities";
import { allEnvironmentProjectSnapshotsReadyAtom } from "../state/shell";
import {
  useActiveSidebarSpaceKey,
  useSidebarSpaces,
  useSidebarSpacesEnabled,
  useSidebarSpaceWriter,
} from "./state";

/** A project created while a space is active joins that space; projects present at startup never do. */
export function useJoinNewProjectsToActiveSpace(): void {
  const enabled = useSidebarSpacesEnabled();
  const spaces = useSidebarSpaces();
  const activeSpaceKey = useActiveSidebarSpaceKey();
  const projects = useProjects();
  const ready = useAtomValue(allEnvironmentProjectSnapshotsReadyAtom);
  const writer = useSidebarSpaceWriter();
  const known = useRef<Set<string> | null>(null);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- reacts to projects appearing in the external project store by writing space membership to server settings
  useEffect(() => {
    if (!ready) return;
    const keys = projects.map((project) =>
      scopedProjectKey({ environmentId: project.environmentId, projectId: project.id }),
    );
    if (known.current === null) {
      known.current = new Set(keys);
      return;
    }
    const active = enabled ? findSidebarSpace(spaces, activeSpaceKey) : null;
    const joining =
      active === null
        ? []
        : projectRefsJoiningActiveSpace({
            known: known.current,
            projects,
            space: active.space,
            now: Date.now(),
          });
    for (const key of keys) known.current.add(key);
    if (active === null || joining.length === 0 || !writer.canEdit(active.homeEnvironmentId)) {
      return;
    }
    void writer.join(active.key, joining);
  }, [ready, projects, enabled, spaces, activeSpaceKey, writer]);
}
