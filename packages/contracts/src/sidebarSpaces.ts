import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { ForwardCompatibleArray, TrimmedNonEmptyString } from "./baseSchemas.ts";

const SIDEBAR_SPACES_MAX = 24;
export const SIDEBAR_SPACE_NAME_MAX_LENGTH = 40;
const SIDEBAR_SPACE_PROJECT_REFS_MAX = 512;
// Real project refs contain a colon, so this sentinel cannot collide with one.
export const SIDEBAR_SPACE_SCRATCH_REF = "no-project";

export const SidebarSpace = Schema.Struct({
  id: TrimmedNonEmptyString.check(Schema.isMaxLength(64)),
  name: TrimmedNonEmptyString.check(Schema.isMaxLength(SIDEBAR_SPACE_NAME_MAX_LENGTH)),
  icon: TrimmedNonEmptyString.check(Schema.isMaxLength(64)),
  projectRefs: Schema.Array(
    Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(1024)),
  ).check(Schema.isMaxLength(SIDEBAR_SPACE_PROJECT_REFS_MAX)),
});
export type SidebarSpace = typeof SidebarSpace.Type;

export const SidebarSpacesSetting = ForwardCompatibleArray(SidebarSpace).pipe(
  // An encoded-side default would reject mixed arrays before their bad entries can drop.
  Schema.withDecodingDefaultType(Effect.succeed([])),
  Schema.catchDecoding(() => Effect.succeedSome([])),
);

export const SidebarSpacesPatchValue = Schema.Array(SidebarSpace).check(
  Schema.isMaxLength(SIDEBAR_SPACES_MAX),
);

export const SIDEBAR_SPACE_KEYBINDING_COMMANDS = [
  "sidebar.space.next",
  "sidebar.space.previous",
  "sidebar.space.all",
  "sidebar.space.1",
  "sidebar.space.2",
  "sidebar.space.3",
  "sidebar.space.4",
  "sidebar.space.5",
  "sidebar.space.6",
  "sidebar.space.7",
  "sidebar.space.8",
  "sidebar.space.9",
] as const;
