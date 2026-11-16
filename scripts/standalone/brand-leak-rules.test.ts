import { describe, expect, it } from "vite-plus/test";
import { FORBIDDEN_PATTERNS, validateVersion, validateVersionCode } from "./brand-leak-rules.ts";

describe("release versions", () => {
  it.each(["0.1.9-botduetdot.1", "1.0.0-botduetdot.20", "0.0.0-botduetdot.0"])(
    "accepts %s",
    (value) => {
      expect(validateVersion(value)).toBe(value);
    },
  );
  it.each([
    "0.1.9",
    "v0.1.9-botduetdot.1",
    "0.1.9-nightly.1",
    "0.1.9-botduetdot.01",
    "01.1.9-botduetdot.1",
    "0.1.9-botduetdot.-1",
    "0.1.9-botduetdot.1+other",
    "1.1.1-botduetdot.9007199254740992",
    "0.1.9-botduetdot.1\n",
  ])("rejects %s", (value) => {
    expect(() => validateVersion(value)).toThrow();
  });
  it("checks leap dates, Play's limit and monotonically increasing codes", () => {
    expect(validateVersionCode("2026111601", "2026111600")).toBe(2026111601);
    expect(validateVersionCode("2024022900", "0")).toBe(2024022900);
    expect(validateVersionCode("2099123199")).toBe(2099123199);
    for (const value of [
      "2023022901",
      "2026130101",
      "2026043101",
      "2026110001",
      "20261116100",
      "2100010100",
      "0000010100",
      "2026111601\n",
    ])
      expect(() => validateVersionCode(value)).toThrow();
    for (const previous of ["2026111601", "2026111699", "NaN", "-1"])
      expect(() => validateVersionCode("2026111601", previous)).toThrow();
  });
});

it("gates every upstream display name, including names already caught as profiles", () => {
  const rule = FORBIDDEN_PATTERNS.find(([name]) => name === "upstream-name")![1];
  for (const value of ["T3 Code", "T3 Code (Alpha)", "Update T3 Code", "Sent by T3 Code"]) {
    expect(new RegExp(rule).test(value)).toBe(true);
  }
  expect(new RegExp(rule).test("BotDuetDot T3Code t3code")).toBe(false);
});
