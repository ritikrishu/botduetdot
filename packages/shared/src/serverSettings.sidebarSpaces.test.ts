import { DEFAULT_SERVER_SETTINGS, type SidebarSpace } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { applyServerSettingsPatch } from "./serverSettings.ts";

const one: SidebarSpace = { id: "one", name: "Bots", icon: "🤖", projectRefs: ["A:p1"] };
const two: SidebarSpace = { id: "two", name: "Dev", icon: "lucide:code", projectRefs: ["A:p2"] };

describe("patching sidebar spaces", () => {
  it("replaces the complete list instead of merging array indices", () => {
    const current = { ...DEFAULT_SERVER_SETTINGS, sidebarSpaces: [one, two] };
    expect(applyServerSettingsPatch(current, { sidebarSpaces: [one] }).sidebarSpaces).toEqual([
      one,
    ]);
    expect(applyServerSettingsPatch(current, { sidebarSpaces: [] }).sidebarSpaces).toEqual([]);
    expect(current.sidebarSpaces).toEqual([one, two]);
  });

  it("preserves spaces when an unrelated setting changes", () => {
    const settings = applyServerSettingsPatch(
      { ...DEFAULT_SERVER_SETTINGS, sidebarSpaces: [one, two] },
      { hideTaggedThreads: true },
    );
    expect(settings.sidebarSpaces).toEqual([one, two]);
    expect(settings.hideTaggedThreads).toBe(true);
  });
});
