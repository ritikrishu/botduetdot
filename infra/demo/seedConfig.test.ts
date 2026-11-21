import { ServerSettings } from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "vitest";

import { demoSettings, demoSpaces } from "./seedConfig.ts";

const decodeSettings = Schema.decodeUnknownSync(ServerSettings);

describe("seedConfig", () => {
  it("demo settings decode as server settings", () => {
    const settings = decodeSettings(
      demoSettings({
        agentPath: "/agent.ts",
        scenariosPath: "/scenarios.json",
        noModelPath: "/bin/no-model",
      }),
    );
    expect(settings.providerInstances.demo?.driver).toBe("acpRegistry");
    expect(settings.providerInstances.codex?.enabled).toBe(false);
  });

  it("spaces reference projects by environment-scoped id", () => {
    expect(
      demoSpaces("env1", [
        { projectId: "p1", title: "acme-weather" },
        { projectId: "p2", title: "notes-cli" },
        { projectId: "p3", title: "pixel-garden" },
      ]),
    ).toEqual([
      { id: "work", name: "Work", icon: "💼", projectRefs: ["env1:p1", "env1:p2"] },
      { id: "side", name: "Side projects", icon: "🚀", projectRefs: ["env1:p3"] },
    ]);
  });

  it("spaces fail loudly when a seeded project is missing", () => {
    expect(() =>
      demoSpaces("env1", [
        { projectId: "p1", title: "acme-weather" },
        { projectId: "p2", title: "notes-cli" },
      ]),
    ).toThrow(/pixel-garden/);
  });
});
