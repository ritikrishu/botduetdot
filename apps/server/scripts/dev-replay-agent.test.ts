// @effect-diagnostics nodeBuiltinImport:off
import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeReadline from "node:readline";
import * as NodeURL from "node:url";

import { describe, expect, it } from "@effect/vitest";

import {
  diffWrites,
  parseAgentArgs,
  parseReplayTurns,
  SCENARIOS,
  streamChunks,
} from "./dev-replay-agent.ts";

interface AgentMessage {
  readonly id?: number;
  readonly method?: string;
  readonly params?: {
    readonly update?: {
      readonly sessionUpdate?: string;
      readonly toolCallId?: string;
      readonly status?: string;
    };
  };
  readonly result?: { readonly sessionId?: string; readonly stopReason?: string };
  readonly error?: { readonly code?: number };
}

/**
 * Runs the agent over stdio and returns every message it sent until each request is answered.
 * Permission requests get `permissionResult`.
 */
async function talkToAgent(
  requests: ReadonlyArray<(sessionId: string) => object>,
  permissionResult: object = { outcome: { outcome: "selected", optionId: "allow-once" } },
  args: ReadonlyArray<string> = [],
) {
  const agent = NodeChildProcess.spawn(
    process.execPath,
    [NodeURL.fileURLToPath(new URL("./dev-replay-agent.ts", import.meta.url)), ...args],
    { stdio: ["pipe", "pipe", "inherit"] },
  );
  const lines = NodeReadline.createInterface({ input: agent.stdout })[Symbol.asyncIterator]();
  const received: Array<AgentMessage> = [];
  let sessionId = "";
  try {
    for (const [index, request] of requests.entries()) {
      agent.stdin.write(
        `${JSON.stringify({ jsonrpc: "2.0", id: index + 1, ...request(sessionId) })}\n`,
      );
      for (;;) {
        const message = JSON.parse((await lines.next()).value as string) as AgentMessage;
        received.push(message);
        if (message.method === "session/request_permission") {
          const answer = { jsonrpc: "2.0", id: message.id, result: permissionResult };
          agent.stdin.write(`${JSON.stringify(answer)}\n`);
        }
        if (message.id !== index + 1 || message.method !== undefined) continue;
        sessionId = message.result?.sessionId ?? sessionId;
        break;
      }
    }
  } finally {
    agent.kill();
  }
  return { sessionId, received };
}

const MATH_OLD = "export const sum = (a: number, b: number) => a + b;\n";
const MATH_NEW = `${MATH_OLD}export const double = (a: number) => a * 2;\n`;

const frame = (type: string, body: object) => JSON.stringify({ type, frame: body });
const update = (body: object) =>
  frame("emit_inbound", {
    kind: "notification",
    method: "session/update",
    params: { sessionId: "s", update: body },
  });
const editDiff = [
  { type: "diff", path: "<workspace>/src/math.ts", oldText: MATH_OLD, newText: MATH_NEW },
];
const approvalTranscript = [
  frame("expect_outbound", { kind: "request", method: "session/prompt", params: "<any>" }),
  update({ sessionUpdate: "tool_call", toolCallId: "e", kind: "edit", content: editDiff }),
  frame("emit_inbound", {
    kind: "request",
    method: "session/request_permission",
    params: {
      sessionId: "s",
      toolCall: { toolCallId: "e", kind: "edit", title: "Edit" },
      options: [
        { optionId: "allow-once", name: "Yes", kind: "allow_once" },
        { optionId: "reject-once", name: "No", kind: "reject_once" },
      ],
    },
  }),
  update({
    sessionUpdate: "tool_call_update",
    toolCallId: "e",
    status: "completed",
    content: editDiff,
  }),
  frame("emit_inbound", {
    kind: "response",
    method: "session/prompt",
    result: { stopReason: "end_turn" },
  }),
].join("\n");

function seedWorkspace(transcript?: string) {
  const dir = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "replay-agent-"));
  NodeFS.mkdirSync(NodePath.join(dir, "src"));
  NodeFS.writeFileSync(NodePath.join(dir, "src", "math.ts"), MATH_OLD);
  const scenarios = transcript === undefined ? undefined : NodePath.join(dir, "scenarios.json");
  if (scenarios !== undefined && transcript !== undefined) {
    NodeFS.writeFileSync(NodePath.join(dir, "t.ndjson"), transcript);
    NodeFS.writeFileSync(scenarios, JSON.stringify([{ id: "t", name: "T", file: "./t.ndjson" }]));
  }
  return {
    dir,
    scenarios,
    read: () => NodeFS.readFileSync(NodePath.join(dir, "src", "math.ts"), "utf8"),
  };
}

const newSessionAndPrompts = (dir: string, prompts: number) => [
  () => ({ method: "session/new", params: { cwd: dir } }),
  ...Array.from({ length: prompts }, () => (sessionId: string) => ({
    method: "session/prompt",
    params: { sessionId },
  })),
];

describe("dev replay agent", () => {
  it("keeps the built-in scenarios when no flags are given", () => {
    const args = parseAgentArgs([]);
    expect(args.scenarios.map((s) => s.id)).toEqual(SCENARIOS.map((s) => s.id));
    expect(args.applyDiffs).toBe(false);
  });

  it("loads scenarios from a JSON file relative to it", () => {
    const { dir } = seedWorkspace("");
    const file = NodePath.join(dir, "scenarios.json");
    NodeFS.writeFileSync(file, JSON.stringify([{ id: "x", name: "X", file: "./x.ndjson" }]));
    const { scenarios } = parseAgentArgs(["--scenarios", file, "--apply-diffs"]);
    expect(scenarios).toHaveLength(1);
    expect(scenarios[0]!.file.href).toBe(
      NodeURL.pathToFileURL(NodePath.join(dir, "x.ndjson")).href,
    );
  });

  it("writes only completed in-workspace diffs", () => {
    const update = (status: string) => ({
      sessionUpdate: "tool_call_update",
      status,
      content: [
        { type: "diff", path: "/w/src/a.ts", newText: "A" },
        { type: "diff", path: "/w/../etc/x", newText: "X" },
        { type: "content", content: { type: "text", text: "ignored" } },
      ],
    });
    expect(diffWrites(update("completed"), "/w")).toEqual([{ path: "/w/src/a.ts", text: "A" }]);
    expect(diffWrites(update("pending"), "/w")).toEqual([]);
  });

  it("applies the showcase edit to disk only with --apply-diffs", async () => {
    const showcase = NodeFS.readFileSync(
      new URL("./dev-replay/showcase_transcript.ndjson", import.meta.url),
      "utf8",
    );
    const diff = (
      JSON.parse(showcase.split("\n")[8]!) as {
        frame: { params: { update: { content: Array<{ oldText: string; newText: string }> } } };
      }
    ).frame.params.update.content[0]!;
    const apply = seedWorkspace();
    NodeFS.writeFileSync(NodePath.join(apply.dir, "src", "math.ts"), diff.oldText);
    await talkToAgent(newSessionAndPrompts(apply.dir, 1), undefined, ["--apply-diffs"]);
    expect(apply.read()).toBe(diff.newText);
    await talkToAgent(newSessionAndPrompts(apply.dir, 2), undefined, ["--apply-diffs"]);
    expect(apply.read()).toBe(diff.newText);

    const plain = seedWorkspace();
    NodeFS.writeFileSync(NodePath.join(plain.dir, "src", "math.ts"), diff.oldText);
    await talkToAgent(newSessionAndPrompts(plain.dir, 1));
    expect(plain.read()).toBe(diff.oldText);
  });

  it("refuses diffs that reach outside the workspace through symlinks", async () => {
    const outside = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "replay-outside-"));
    const secret = NodePath.join(outside, "secret.ts");
    NodeFS.writeFileSync(secret, "untouched");
    const diffTo = (path: string) =>
      update({
        sessionUpdate: "tool_call_update",
        toolCallId: "e",
        status: "completed",
        content: [{ type: "diff", path, oldText: "", newText: "pwned" }],
      });
    const transcript = [
      frame("expect_outbound", { kind: "request", method: "session/prompt", params: "<any>" }),
      diffTo("<workspace>/src/math.ts"),
      diffTo("<workspace>/linked/secret.ts"),
      diffTo("<workspace>/linked/deeper/new.ts"),
      frame("emit_inbound", {
        kind: "response",
        method: "session/prompt",
        result: { stopReason: "end_turn" },
      }),
    ].join("\n");
    const ws = seedWorkspace(transcript);
    NodeFS.rmSync(NodePath.join(ws.dir, "src", "math.ts"));
    NodeFS.symlinkSync(secret, NodePath.join(ws.dir, "src", "math.ts"));
    NodeFS.symlinkSync(outside, NodePath.join(ws.dir, "linked"));
    await talkToAgent(newSessionAndPrompts(ws.dir, 1), undefined, [
      "--apply-diffs",
      "--scenarios",
      ws.scenarios!,
    ]);
    expect(NodeFS.readFileSync(secret, "utf8")).toBe("untouched");
    expect(NodeFS.existsSync(NodePath.join(outside, "deeper"))).toBe(false);
  });

  it("writes the edit only when the approval is allowed", async () => {
    const rejected = seedWorkspace(approvalTranscript);
    const flags = (scenarios: string) => ["--apply-diffs", "--scenarios", scenarios];
    await talkToAgent(
      newSessionAndPrompts(rejected.dir, 1),
      { outcome: { outcome: "selected", optionId: "reject-once" } },
      flags(rejected.scenarios!),
    );
    expect(rejected.read()).toBe(MATH_OLD);

    const allowed = seedWorkspace(approvalTranscript);
    await talkToAgent(newSessionAndPrompts(allowed.dir, 1), undefined, flags(allowed.scenarios!));
    expect(allowed.read()).toBe(MATH_NEW);
  });

  it("keeps sessions and tool ids unique across processes and reloads", async () => {
    const prompt = (sessionId: string) => ({ method: "session/prompt", params: { sessionId } });
    const selectTodoList = (sessionId: string) => ({
      method: "session/set_model",
      params: { sessionId, modelId: "todo-list" },
    });
    const run = () =>
      talkToAgent([
        () => ({ method: "session/new", params: { cwd: "/tmp" } }),
        selectTodoList,
        prompt,
        prompt,
      ]);
    const [first, second] = await Promise.all([run(), run()]);
    expect(first.sessionId).not.toBe(second.sessionId);
    // A server restart loads the same session in a new agent process.
    const reloaded = await talkToAgent([
      () => ({ method: "session/load", params: { sessionId: first.sessionId, cwd: "/tmp" } }),
      () => selectTodoList(first.sessionId),
      () => prompt(first.sessionId),
    ]);
    const toolCallIds = [...first.received, ...reloaded.received].flatMap((message) =>
      message.params?.update?.toolCallId === undefined ? [] : [message.params.update.toolCallId],
    );
    expect(new Set(toolCallIds).size).toBe(6);
  });

  it.each(SCENARIOS)("$id plays a turn without session setup frames", ({ file }) => {
    const turns = parseReplayTurns(NodeFS.readFileSync(file, "utf8"));
    expect(turns.length).toBeGreaterThan(0);
    const updates = turns.flatMap((turn) =>
      turn.frames.flatMap(({ frame }) =>
        frame.method === "session/update"
          ? [(frame.params as { update: { sessionUpdate: string } }).update.sessionUpdate]
          : [],
      ),
    );
    expect(updates).toContain("agent_message_chunk");
    expect(updates).not.toContain("available_commands_update");
  });

  it("keeps permission requests and the recorded stop reason in order", () => {
    const turns = parseReplayTurns(NodeFS.readFileSync(SCENARIOS[0]!.file, "utf8"));
    const methods = turns[0]!.frames.map(({ frame }) => frame.method);
    expect(methods).toContain("session/request_permission");
    expect(turns[0]!.stopReason).toBe("end_turn");
  });

  it("rejects an unknown scenario instead of playing another one", async () => {
    const { received } = await talkToAgent([
      () => ({ method: "session/new", params: { cwd: "/tmp" } }),
      (sessionId) => ({ method: "session/set_model", params: { sessionId, modelId: "typo" } }),
    ]);
    expect(received.at(-1)?.error?.code).toBe(-32602);
  });

  it("ends the turn with a failed tool call when the user rejects an approval", async () => {
    const { received } = await talkToAgent(
      [
        () => ({ method: "session/new", params: { cwd: "/tmp" } }),
        (sessionId) => ({ method: "session/prompt", params: { sessionId } }),
      ],
      { outcome: { outcome: "selected", optionId: "reject-once" } },
    );
    const updates = received.flatMap((message) =>
      message.params?.update === undefined ? [] : [message.params.update],
    );
    expect(updates.at(-1)).toMatchObject({ sessionUpdate: "tool_call_update", status: "failed" });
    expect(updates.some((update) => update.toolCallId?.endsWith("showcase-test"))).toBe(false);
    expect(received.at(-1)?.result?.stopReason).toBe("end_turn");
  });

  it("ends the turn as cancelled when the client cancels an open approval", async () => {
    const { received } = await talkToAgent(
      [
        () => ({ method: "session/new", params: { cwd: "/tmp" } }),
        (sessionId) => ({ method: "session/prompt", params: { sessionId } }),
      ],
      { outcome: { outcome: "cancelled" } },
    );
    const requestIndex = received.findIndex(
      (message) => message.method === "session/request_permission",
    );
    expect(received.slice(requestIndex + 1).some((message) => message.method !== undefined)).toBe(
      false,
    );
    expect(received.at(-1)?.result?.stopReason).toBe("cancelled");
  });

  it("leaves frames after a prompt's response out of that turn", () => {
    const update = (text: string) => ({
      type: "emit_inbound",
      frame: {
        kind: "notification",
        method: "session/update",
        params: {
          update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text } },
        },
      },
    });
    const transcript = [
      { type: "expect_outbound", frame: { kind: "request", method: "session/prompt" } },
      update("root"),
      { type: "emit_inbound", frame: { kind: "response", method: "session/prompt", result: {} } },
      update("background"),
    ]
      .map((entry) => JSON.stringify(entry))
      .join("\n");
    const turns = parseReplayTurns(transcript);
    expect(turns).toHaveLength(1);
    expect(turns[0]!.frames).toHaveLength(1);
  });

  it("streams text in chunks that rebuild the original", () => {
    const text = "One two three four five\n\n```ts\nx\n```";
    const chunks = streamChunks(text);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.join("")).toBe(text);
  });
});
