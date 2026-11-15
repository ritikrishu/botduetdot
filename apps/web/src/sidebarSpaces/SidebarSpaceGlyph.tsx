import {
  sidebarSpaceIconParts,
  sidebarSpaceMonogram,
} from "@t3tools/client-runtime/state/sidebar-spaces";
import {
  BookOpenIcon,
  BotIcon,
  BriefcaseIcon,
  BugIcon,
  CalendarIcon,
  CodeIcon,
  FlaskConicalIcon,
  FolderIcon,
  GlobeIcon,
  HeartIcon,
  HouseIcon,
  InboxIcon,
  LayersIcon,
  MessageSquareIcon,
  RocketIcon,
  LightbulbIcon,
  StarIcon,
  TerminalIcon,
  WrenchIcon,
  ZapIcon,
  type LucideIcon,
} from "lucide-react";

export const SIDEBAR_SPACE_LUCIDE_ICONS: Readonly<Record<string, LucideIcon>> = {
  bot: BotIcon,
  code: CodeIcon,
  briefcase: BriefcaseIcon,
  inbox: InboxIcon,
  rocket: RocketIcon,
  "flask-conical": FlaskConicalIcon,
  "book-open": BookOpenIcon,
  globe: GlobeIcon,
  house: HouseIcon,
  star: StarIcon,
  zap: ZapIcon,
  wrench: WrenchIcon,
  terminal: TerminalIcon,
  "message-square": MessageSquareIcon,
  calendar: CalendarIcon,
  heart: HeartIcon,
  bug: BugIcon,
  lightbulb: LightbulbIcon,
  folder: FolderIcon,
  layers: LayersIcon,
};

export function SidebarSpaceGlyph(props: { icon: string; name: string; className?: string }) {
  const parts = sidebarSpaceIconParts(props.icon);
  if (parts.kind === "lucide" && Object.hasOwn(SIDEBAR_SPACE_LUCIDE_ICONS, parts.name)) {
    const Icon = SIDEBAR_SPACE_LUCIDE_ICONS[parts.name]!;
    return <Icon className={props.className} aria-hidden="true" />;
  }
  return (
    <span className={props.className} aria-hidden="true">
      {parts.kind === "text" ? parts.text : sidebarSpaceMonogram(props.name)}
    </span>
  );
}
