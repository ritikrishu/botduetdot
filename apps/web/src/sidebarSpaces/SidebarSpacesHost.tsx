import { scrollSidebarListToTop } from "./scrollSidebarListToTop";
import { useEffect } from "react";
import { SIDEBAR_SPACE_KEYBINDING_COMMANDS } from "@t3tools/contracts";
import { resolveSidebarSpaceCommand } from "@t3tools/client-runtime/state/sidebar-spaces";
import { registerCommands, type CommandHandlers } from "../shortcuts/dispatcher";
import { closeSidebarSpaceEditor, useSidebarSpaceEditorRequest } from "./editorStore";
import { SidebarSpaceEditorDialog } from "./SidebarSpaceEditorDialog";
import {
  activateSidebarSpace,
  readActiveSidebarSpaceKey,
  useSidebarSpaces,
  useSidebarSpacesEnabled,
} from "./state";

export function SidebarSpacesHost() {
  const spaces = useSidebarSpaces();
  const enabled = useSidebarSpacesEnabled();
  const request = useSidebarSpaceEditorRequest();
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- registers handlers with the external keyboard command dispatcher and unregisters on unmount
  useEffect(() => {
    const handlers: CommandHandlers = {};
    for (const command of SIDEBAR_SPACE_KEYBINDING_COMMANDS) {
      handlers[command] = (event) => {
        if (!enabled) return false;
        const target = resolveSidebarSpaceCommand({
          command,
          spaceKeys: spaces.map((space) => space.key),
          activeSpaceKey: readActiveSidebarSpaceKey(),
        });
        if (target === null) return false;
        event.preventDefault();
        event.stopPropagation();
        activateSidebarSpace(target.spaceKey);
        scrollSidebarListToTop();
      };
    }
    return registerCommands(handlers);
  }, [enabled, spaces]);
  return request ? (
    <SidebarSpaceEditorDialog request={request} onClose={closeSidebarSpaceEditor} />
  ) : null;
}
