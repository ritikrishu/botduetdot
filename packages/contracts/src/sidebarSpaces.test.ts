import * as Schema from "effect/Schema";
import { describe, expect, it } from "vite-plus/test";

import { KeybindingCommand } from "./keybindings.ts";
import { ServerSettings, ServerSettingsPatch } from "./settings.ts";
import { SIDEBAR_SPACE_KEYBINDING_COMMANDS, type SidebarSpace } from "./sidebarSpaces.ts";

const decodeSettings = Schema.decodeUnknownSync(ServerSettings);
const encodeSettings = Schema.encodeSync(ServerSettings);
const decodePatch = Schema.decodeUnknownSync(ServerSettingsPatch);

function space(id: string): SidebarSpace {
  return { id, name: `Space ${id}`, icon: "🤖", projectRefs: ["A:p1", "no-project"] };
}

describe("sidebar spaces settings", () => {
  it("defaults missing spaces and round-trips a valid list", () => {
    expect(decodeSettings({}).sidebarSpaces).toEqual([]);
    const settings = decodeSettings({ sidebarSpaces: [space("a"), space("b")] });
    expect(decodeSettings(encodeSettings(settings))).toEqual(settings);
  });

  it("drops only malformed entries from a mixed array without losing sibling settings", () => {
    const settings = decodeSettings({
      hideTaggedThreads: true,
      sidebarSpaces: [
        space("a"),
        {},
        { id: "b" },
        { ...space("c"), projectRefs: [1] },
        "x",
        null,
        space("d"),
      ],
    });
    expect(settings.sidebarSpaces).toEqual([space("a"), space("d")]);
    expect(settings.hideTaggedThreads).toBe(true);
  });

  it.each([{}, "nope", null, 123, false])("recovers a non-array field (%j)", (sidebarSpaces) => {
    const settings = decodeSettings({ sidebarSpaces, hideTaggedThreads: true });
    expect(settings.sidebarSpaces).toEqual([]);
    expect(settings.hideTaggedThreads).toBe(true);
  });

  it("keeps all 30 persisted entries without applying the patch limit", () => {
    const sidebarSpaces = Array.from({ length: 30 }, (_, index) => space(String(index)));
    expect(decodeSettings({ sidebarSpaces }).sidebarSpaces).toEqual(sidebarSpaces);
  });

  it("accepts unknown entry and document fields", () => {
    const settings = decodeSettings({
      futureSetting: { enabled: true },
      sidebarSpaces: [{ ...space("a"), futureField: "value" }],
    });
    expect(settings.sidebarSpaces).toEqual([space("a")]);
  });

  it("accepts absent and valid patches but rejects oversized or malformed values", () => {
    expect(decodePatch({})).toEqual({});
    expect(decodePatch({ sidebarSpaces: [space("a")] })).toEqual({ sidebarSpaces: [space("a")] });
    for (const sidebarSpaces of [
      Array.from({ length: 25 }, (_, index) => space(String(index))),
      [{ ...space("a"), name: "a".repeat(41) }],
      [space("a"), {}],
      null,
    ]) {
      expect(() => decodePatch({ sidebarSpaces })).toThrow();
    }
  });
});

it("accepts exactly the space commands, with slots limited to nine", () => {
  const decodeCommand = Schema.decodeUnknownSync(KeybindingCommand);
  for (const command of SIDEBAR_SPACE_KEYBINDING_COMMANDS) {
    expect(decodeCommand(command)).toBe(command);
  }
  expect(() => decodeCommand("sidebar.space.10")).toThrow();
});
