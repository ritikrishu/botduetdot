import * as NodePath from "node:path";
import { describe, expect, it } from "vitest";

import { parseAgentArgs, parseReplayTurns } from "../../../apps/server/scripts/dev-replay-agent.ts";
import { ACME_FORECAST_TS, DEMO_REPOS } from "../fixtures.ts";
import * as NodeFS from "node:fs";

const scenariosPath = NodePath.join(import.meta.dirname, "scenarios.json");

function load() {
  const { scenarios } = parseAgentArgs(["--scenarios", scenariosPath]);
  return scenarios.map((scenario) => ({
    id: scenario.id,
    turns: parseReplayTurns(NodeFS.readFileSync(scenario.file, "utf8")),
  }));
}

function diffs(turns: ReturnType<typeof parseReplayTurns>) {
  return turns.flatMap((turn, index) =>
    turn.frames.flatMap(({ frame }) => {
      const update = (frame.params as { update?: { content?: unknown } } | undefined)?.update;
      const content = Array.isArray(update?.content) ? update.content : [];
      return content
        .filter((entry: { type?: string }) => entry?.type === "diff")
        .map((entry: { path: string; oldText: string; newText: string }) => ({
          ...entry,
          turn: index,
        }));
    }),
  );
}

describe("demo recordings", () => {
  it("each demo recording parses into playable turns", () => {
    const recordings = load();
    expect(recordings.map((r) => r.id)).toEqual(["code-change", "approval", "question"]);
    for (const recording of recordings) expect(recording.turns.length).toBeGreaterThanOrEqual(1);

    const byId = Object.fromEntries(recordings.map((r) => [r.id, r.turns]));
    const methods = (id: string) => byId[id]!.flatMap((t) => t.frames.map((f) => f.frame.method));
    expect(methods("approval")).toContain("session/request_permission");
    expect(methods("question")).toContain("elicitation/create");

    for (const recording of recordings) {
      for (const entry of diffs(recording.turns))
        expect(entry.path.startsWith("<workspace>/")).toBe(true);
    }

    const codeChange = diffs(byId["code-change"]!);
    expect(codeChange.find((d) => d.turn === 0)?.oldText).toBe(ACME_FORECAST_TS);
    expect(codeChange.find((d) => d.turn === 1)).toMatchObject({
      path: "<workspace>/src/forecast.test.ts",
      oldText: "",
    });
    expect(diffs(byId["approval"]!)[0]?.oldText).toBe(DEMO_REPOS["acme-weather"]["README.md"]);
  });
});
