import { expect, it, vi } from "vite-plus/test";
vi.mock("@t3tools/contracts/brand", async (importOriginal) => {
  const original = await importOriginal<typeof import("@t3tools/contracts/brand")>();
  return { ...original, BRAND: original.STANDALONE_BRAND };
});
import { managedPolicyPath } from "./managedPolicyFile.ts";

it("reads the standalone policy file, never the official app's", () => {
  expect(managedPolicyPath("darwin")).toBe("/Library/Application Support/BotDuetDot/policy.json");
  expect(managedPolicyPath("win32")).toBe("C:\\Program Files\\BotDuetDot\\policy.json");
  expect(managedPolicyPath("linux")).toBe("/etc/botduetdot/policy.json");
});
