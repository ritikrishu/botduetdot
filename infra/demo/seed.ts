import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodeNet from "node:net";
import * as NodePath from "node:path";
import * as NodeSqlite from "node:sqlite";
import * as NodeUtil from "node:util";

import { DEMO_REPOS, DEMO_THREADS } from "./fixtures.ts";
import { demoSettings, demoSpaces } from "./seedConfig.ts";

const { values } = NodeUtil.parseArgs({
  options: {
    server: { type: "string" },
    agent: { type: "string" },
    recordings: { type: "string" },
    out: { type: "string" },
  },
});
const { server, agent, recordings, out } = Object.fromEntries(
  (["server", "agent", "recordings", "out"] as const).map((key) => {
    const value = values[key];
    if (!value) throw new Error(`Missing --${key}`);
    return [key, NodePath.resolve(value)];
  }),
) as Record<"server" | "agent" | "recordings" | "out", string>;

const userdata = NodePath.join(out, "userdata");
const settingsPath = NodePath.join(userdata, "settings.json");
const author = ["-c", "user.name=Demo", "-c", "user.email=demo@example.invalid"];

const git = (cwd: string, args: ReadonlyArray<string>) =>
  NodeChildProcess.execFileSync("git", [...author, ...args], { cwd, stdio: "pipe" });

function createRepo(name: keyof typeof DEMO_REPOS) {
  const dir = NodePath.join(out, "workspaces", name);
  NodeFS.mkdirSync(dir, { recursive: true });
  git(dir, ["init", "--quiet", "--initial-branch=main"]);
  const files = Object.entries(DEMO_REPOS[name]);
  const batches = [files.slice(0, 1), files.slice(1, 2), files.slice(2)].filter(
    (batch) => batch.length > 0,
  );
  for (const [index, batch] of batches.entries()) {
    for (const [file, content] of batch) {
      NodeFS.mkdirSync(NodePath.dirname(NodePath.join(dir, file)), { recursive: true });
      NodeFS.writeFileSync(NodePath.join(dir, file), content);
    }
    git(dir, ["add", "--all"]);
    git(dir, [
      "commit",
      "--quiet",
      "--message",
      index === 0 ? "Initial commit" : `Add ${batch[0]![0]}`,
    ]);
  }
  return dir;
}

function cli(args: ReadonlyArray<string>, allowExit: ReadonlyArray<number> = [0]) {
  const result = NodeChildProcess.spawnSync("node", [server, ...args, "--base-dir", out], {
    encoding: "utf8",
  });
  if (!allowExit.includes(result.status ?? -1)) {
    throw new Error(
      `t3 ${args.join(" ")} exited ${result.status}\n${result.stdout}${result.stderr}`,
    );
  }
  return result;
}

function freePort() {
  return new Promise<number>((resolve, reject) => {
    const probe = NodeNet.createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address() as NodeNet.AddressInfo;
      probe.close(() => resolve(port));
    });
  });
}

// The CLI finds the server through server-runtime.json, which is written after HTTP starts listening.
async function waitForServer(port: number, exited: () => boolean) {
  const runtimeState = NodePath.join(userdata, "server-runtime.json");
  for (let attempt = 0; attempt < 120; attempt++) {
    if (exited()) throw new Error("server exited before it was ready");
    try {
      await fetch(`http://127.0.0.1:${port}/`);
      if (NodeFS.existsSync(runtimeState)) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("server did not become ready within 60s");
}

NodeFS.rmSync(out, { recursive: true, force: true });
NodeFS.mkdirSync(userdata, { recursive: true });
NodeFS.mkdirSync(NodePath.join(out, "bin"));
const noModel = NodePath.join(out, "bin/no-model");
NodeFS.writeFileSync(noModel, "#!/bin/sh\necho 'demo runs no model' >&2\nexit 1\n", {
  mode: 0o755,
});
const settings = demoSettings({
  agentPath: agent,
  scenariosPath: NodePath.join(recordings, "scenarios.json"),
  noModelPath: noModel,
}) as Record<string, unknown>;
NodeFS.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));

const workspaces = Object.fromEntries(
  (Object.keys(DEMO_REPOS) as Array<keyof typeof DEMO_REPOS>).map((name) => [
    name,
    createRepo(name),
  ]),
);

// `project add` writes the database directly, so it must run while no server owns the home.
for (const [name, dir] of Object.entries(workspaces)) {
  cli(["project", "add", dir, "--title", name]);
}

const port = await freePort();
const child = NodeChildProcess.spawn(
  "node",
  [server, "serve", "--base-dir", out, "--port", String(port), "--host", "127.0.0.1"],
  { stdio: "ignore" },
);
let exited = false;
const stopped = new Promise<void>((resolve) => {
  const done = () => {
    exited = true;
    resolve();
  };
  child.once("exit", done);
  child.once("error", done);
});

try {
  await waitForServer(port, () => exited);
  for (const thread of DEMO_THREADS) {
    const allowed = thread.model === "question" ? [0, 2] : [0];
    const [first = "Start", ...rest] = thread.messages;
    const started = cli(
      [
        "thread",
        "start",
        workspaces[thread.repo]!,
        first,
        "--title",
        thread.title,
        "--provider",
        "demo",
        "--model",
        thread.model,
        "--wait",
        "--json",
      ],
      allowed,
    );
    const { threadId } = JSON.parse(
      started.stdout.split("\n").findLast((line) => line.startsWith("{")) ?? "",
    ) as { threadId: string };
    for (const message of rest)
      cli(["thread", "send", threadId, message, "--wait", "--json"], allowed);
  }
} finally {
  if (!exited) {
    child.kill("SIGTERM");
    const forceKill = setTimeout(() => child.kill("SIGKILL"), 10_000);
    await stopped;
    clearTimeout(forceKill);
  }
}

const environmentId = NodeFS.readFileSync(NodePath.join(userdata, "environment-id"), "utf8").trim();
const db = new NodeSqlite.DatabaseSync(NodePath.join(userdata, "statev2.sqlite"), {
  readOnly: true,
});
const projects = db
  .prepare(
    "SELECT project_id AS projectId, title FROM projection_projects WHERE deleted_at IS NULL",
  )
  .all() as Array<{ projectId: string; title: string }>;
db.close();
settings.sidebarSpaces = demoSpaces(environmentId, projects);
NodeFS.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));

console.log(`golden home ready: ${out}`);
