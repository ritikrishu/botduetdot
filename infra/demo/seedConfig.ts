import type { SidebarSpace } from "@t3tools/contracts";

import { DEMO_SPACES } from "./fixtures.ts";

// Every driver the server could fall back to for generated text. Mirror of REAL_PROVIDERS in
// scripts/scenarios/start-app.ts.
const REAL_PROVIDERS = [
  "codex",
  "claudeAgent",
  "cursor",
  "grok",
  "muse",
  "pi",
  "opencode",
  "antigravity",
];

export function demoSettings(input: {
  agentPath: string;
  scenariosPath: string;
  noModelPath: string;
}): unknown {
  return {
    defaultModelSelection: { instanceId: "demo", model: "code-change" },
    providerInstances: {
      demo: {
        displayName: "Demo agent",
        driver: "acpRegistry",
        config: {
          source: "local",
          commandPath: "node",
          commandArgs: [input.agentPath, "--scenarios", input.scenariosPath, "--apply-diffs"],
        },
      },
      ...Object.fromEntries(
        REAL_PROVIDERS.map((driver) => [
          driver,
          {
            driver,
            enabled: false,
            ...(driver === "codex" ? { config: { binaryPath: input.noModelPath } } : {}),
          },
        ]),
      ),
    },
  };
}

export function demoSpaces(
  environmentId: string,
  projects: ReadonlyArray<{ projectId: string; title: string }>,
): ReadonlyArray<SidebarSpace> {
  return DEMO_SPACES.map(({ repos, ...space }) => ({
    ...space,
    projectRefs: repos.map((title) => {
      const project = projects.find((candidate) => candidate.title === title);
      if (!project) throw new Error(`Seeded project missing: ${title}`);
      return `${environmentId}:${project.projectId}`;
    }),
  }));
}
