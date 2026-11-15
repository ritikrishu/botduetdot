import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/shell";
import {
  sidebarSpaceIconParts,
  sidebarSpaceMonogram,
  sidebarSpaceProjectRefKeys,
  sidebarSpacesNeedingAttention,
} from "@t3tools/client-runtime/state/sidebar-spaces";
import { isListedThreadLineage } from "@t3tools/contracts";
import { useMemo } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { AppText } from "../../../components/ui/AppText";
import { Chip } from "../../../components/ui/Chip";
import { useAppearancePreferences } from "../../settings/appearance/AppearancePreferencesProvider";
import { resolveThreadListV2Status } from "../../threads/threadListV2";
import { setActiveMobileSidebarSpaceKey } from "./mobileSpacesState";
import type { MobileActiveSpace } from "./useActiveSpaceHomeScope";

export function MobileSpacesBar(props: {
  readonly activeSpace: MobileActiveSpace;
  readonly threads: ReadonlyArray<EnvironmentThreadShell>;
  readonly selectedProjectKey: string | null;
  readonly onProjectChange: (key: string | null) => void;
  readonly gutter: number;
}) {
  const { spaces, groups } = props.activeSpace;
  const { themeAppearance } = useAppearancePreferences();
  const attention = useMemo(() => {
    if (spaces.length === 0) return new Set<string>();
    return sidebarSpacesNeedingAttention({
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
    });
  }, [spaces, groups, props.threads]);
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
          if (props.selectedProjectKey !== null) props.onProjectChange(null);
        }}
      />
      {spaces.map(({ key, space }) => {
        const selected =
          props.activeSpace.selection.kind === "space" &&
          props.activeSpace.selection.spaceKey === key;
        const needsYou = !selected && attention.has(key);
        const icon = sidebarSpaceIconParts(space.icon);
        const glyph = icon.kind === "text" ? icon.text : sidebarSpaceMonogram(space.name);
        const unresolved = props.activeSpace.unresolvedSpaceKey === key;
        const label = `${glyph} ${space.name}`;
        const accessibilityLabel = `${space.name}${unresolved ? ", no matching projects" : ""}${needsYou ? ", needs you" : ""}`;
        const onPress = () => {
          if (props.selectedProjectKey !== null) props.onProjectChange(null);
          setActiveMobileSidebarSpaceKey(key);
        };
        return (
          <View key={key}>
            {unresolved ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={accessibilityLabel}
                accessibilityState={{ selected: false }}
                onPress={onPress}
                hitSlop={6}
                className="min-h-8 flex-row items-center rounded-2xl bg-subtle/45 px-3 py-1.5"
              >
                <AppText
                  textRole="footnote"
                  numberOfLines={1}
                  className="max-w-[180px] shrink font-t3-medium text-foreground-muted opacity-45"
                >
                  {label}
                </AppText>
              </Pressable>
            ) : (
              <Chip
                label={label}
                selected={selected}
                glass
                colorScheme={themeAppearance}
                accessibilityLabel={accessibilityLabel}
                onPress={onPress}
              />
            )}
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
