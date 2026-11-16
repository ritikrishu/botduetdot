import { expect, it } from "@effect/vitest";
import { vi } from "vite-plus/test";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as NodeCrypto from "@effect/platform-node/NodeCrypto";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Result from "effect/Result";
import * as ServerConfig from "../config.ts";
import * as GitVcsDriver from "../vcs/GitVcsDriver.ts";
import * as VcsProcess from "../vcs/VcsProcess.ts";
import { ChildProcessSpawner } from "effect/process";

async function loadBrand(id: "upstream" | "standalone") {
  vi.resetModules();
  vi.doMock("@t3tools/contracts/brand", async (importOriginal) => {
    const original = await importOriginal<typeof import("@t3tools/contracts/brand")>();
    return { ...original, BRAND: original.resolveBrandProfile(id) };
  });
  return import("./TriageService.ts");
}

it.effect.each(["upstream", "standalone"] as const)(
  "%s gates RPC triage before filesystem writes or git",
  (id) =>
    Effect.gen(function* () {
      const TriageService = yield* Effect.promise(() => loadBrand(id));
      const commands: ReadonlyArray<string>[] = [];
      const writes: string[] = [];
      yield* Effect.suspend(() =>
        Effect.gen(function* () {
          const config = yield* ServerConfig.ServerConfig;
          const fs = yield* FileSystem.FileSystem;
          const git = yield* GitVcsDriver.GitVcsDriver;
          yield* fs.makeDirectory(`${config.baseDir}/source-staging`, { recursive: true });
          yield* fs.writeFileString(`${config.baseDir}/source-staging/sentinel`, "keep");
          const result = yield* Effect.gen(function* () {
            const service = yield* TriageService.TriageService;
            return yield* service
              .prepare({ client: { webDeployment: "hosted" } })
              .pipe(Effect.result);
          }).pipe(
            Effect.provide(TriageService.layer),
            Effect.provideService(GitVcsDriver.GitVcsDriver, {
              ...git,
              execute: (input) => {
                commands.push(input.args);
                return Effect.succeed({
                  exitCode: ChildProcessSpawner.ExitCode(0),
                  stdout: "",
                  stderr: "",
                  stdoutTruncated: false,
                  stderrTruncated: false,
                });
              },
            }),
            Effect.provideService(FileSystem.FileSystem, {
              ...fs,
              remove: (...args) => {
                writes.push("remove");
                return fs.remove(...args);
              },
              makeDirectory: (...args) => {
                writes.push("mkdir");
                return fs.makeDirectory(...args);
              },
              writeFileString: (...args) => {
                writes.push("write");
                return fs.writeFileString(...args);
              },
            }),
          );
          if (id === "upstream") {
            expect(Result.isSuccess(result)).toBe(true);
            expect(commands[0]).toContain("https://github.com/pingdotgg/t3code");
            expect(writes).toContain("write");
          } else {
            expect(Result.isFailure(result)).toBe(true);
            if (Result.isFailure(result))
              expect(result.failure._tag).toBe("ServerPrepareTriageError");
            expect(commands).toEqual([]);
            expect(writes).toEqual([]);
            expect(yield* fs.exists(`${config.stateDir}/triage`)).toBe(false);
            expect(yield* fs.readFileString(`${config.baseDir}/source-staging/sentinel`)).toBe(
              "keep",
            );
          }
        }).pipe(
          Effect.provide(
            GitVcsDriver.layer.pipe(
              Layer.provideMerge(VcsProcess.layer),
              Layer.provideMerge(
                ServerConfig.layerTest(process.cwd(), { prefix: "brand-triage-" }),
              ),
              Layer.provideMerge(Layer.mergeAll(NodeServices.layer, NodeCrypto.layer)),
            ),
          ),
          Effect.scoped,
        ),
      );
    }),
);
