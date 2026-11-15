import type {
  EnvironmentProject,
  EnvironmentThreadShell,
} from "@t3tools/client-runtime/state/shell";
import {
  sidebarSpaceIconParts,
  sidebarSpaceMonogram,
  sidebarSpaceProjectRefKeys,
  sidebarSpacesNeedingAttention,
} from "@t3tools/client-runtime/state/sidebar-spaces";
import { isListedThreadLineage, type SidebarProjectGroupingMode } from "@t3tools/contracts";
import { useMemo } from "react";
import { ScrollView, View } from "react-native";
import { Chip } from "../../../components/ui/Chip";
import { useAppearancePreferences } from "../../settings/appearance/AppearancePreferencesProvider";
import { resolveThreadListV2Status } from "../../threads/threadListV2";
import { setActiveMobileSidebarSpaceKey, useMobileSidebarSpaces } from "./mobileSpacesState";
import { useMobileSpaceProjectGroups, type MobileActiveSpace } from "./useActiveSpaceHomeScope";

export function MobileSpacesBar(props: {
  readonly activeSpace: MobileActiveSpace;
  readonly projects: ReadonlyArray<EnvironmentProject>;
  readonly projectGroupingMode: SidebarProjectGroupingMode;
  readonly threads: ReadonlyArray<EnvironmentThreadShell>;
  readonly onProjectChange: (key: string | null) => void;
  readonly gutter: number;
}) {
  const spaces = useMobileSidebarSpaces();
  const groups = useMobileSpaceProjectGroups(props.projects, props.projectGroupingMode);
  const { themeAppearance } = useAppearancePreferences();
  const attention = useMemo(
    () =>
      sidebarSpacesNeedingAttention({
        spaces: spaces.map((space) => ({
          key: space.key,
          projectRefKeys: sidebarSpaceProjectRefKeys(space.space, groups),
        })),
        threads: props.threads,
        isListed: (thread) => thread.archivedAt === null && isListedThreadLineage(thread.lineage),
        needsYou: (thread) => {
          const status = resolveThreadListV2Status(thread);
          return (
            status === "approval" ||
            status === "input" ||
            status === "request" ||
            status === "limited"
          );
        },
      }),
    [spaces, groups, props.threads],
  );
  if (spaces.length === 0) return null;
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={{
        alignSelf: "stretch",
        flexGrow: 0,
        marginHorizontal: -props.gutter,
        overflow: "visible",
      }}
      contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 2, paddingBottom: 10, gap: 8 }}
    >
      <Chip
        label="All"
        selected={props.activeSpace.selection.kind === "all"}
        glass
        colorScheme={themeAppearance}
        onPress={() => {
          setActiveMobileSidebarSpaceKey(null);
          props.onProjectChange(null);
        }}
      />
      {spaces.map(({ key, space }) => {
        const selected =
          props.activeSpace.selection.kind === "space" &&
          props.activeSpace.selection.spaceKey === key;
        const needsYou = !selected && attention.has(key);
        const icon = sidebarSpaceIconParts(space.icon);
        const glyph = icon.kind === "text" ? icon.text : sidebarSpaceMonogram(space.name);
        return (
          <View
            key={key}
            style={{ opacity: props.activeSpace.unresolvedSpaceKey === key ? 0.45 : 1 }}
          >
            <Chip
              label={`${glyph} ${space.name}`}
              selected={selected}
              glass
              colorScheme={themeAppearance}
              accessibilityLabel={`${space.name}${needsYou ? ", needs you" : ""}`}
              onPress={() => {
                props.onProjectChange(null);
                setActiveMobileSidebarSpaceKey(key);
              }}
            />
            {needsYou ? (
              <View
                pointerEvents="none"
                className="absolute right-0 top-0 h-2 w-2 rounded-full bg-warning"
              />
            ) : null}
          </View>
        );
      })}
    </ScrollView>
  );
}
