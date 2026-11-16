import { expect, it } from "@effect/vitest";
import { vi } from "vite-plus/test";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Result from "effect/Result";
import * as ConfigProvider from "effect/ConfigProvider";
import * as HostProcess from "@t3tools/shared/HostProcess";
import { Command } from "effect/cli";

async function loadBrand(id: "upstream" | "standalone") {
  vi.resetModules();
  vi.doMock("@t3tools/contracts/brand", async (importOriginal) => {
    const original = await importOriginal<typeof import("@t3tools/contracts/brand")>();
    return { ...original, BRAND: original.resolveBrandProfile(id) };
  });
  return import("./triage.ts");
}

it.effect.each(["upstream", "standalone"] as const)(
  "%s gates CLI triage before creating a session",
  (id) =>
    Effect.gen(function* () {
      const { triageCommand } = yield* Effect.promise(() => loadBrand(id));
      yield* Effect.suspend(() =>
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const home = yield* fs.makeTempDirectoryScoped({ prefix: "brand-cli-triage-" });
          const cli = Command.make("test").pipe(Command.withSubcommands([triageCommand]));
          const result = yield* Command.runWith(cli, { version: "0.0.0" })([
            "triage",
            "--base-dir",
            home,
          ]).pipe(Effect.result);
          if (id === "upstream") {
            expect(Result.isSuccess(result)).toBe(true);
            expect((yield* fs.readDirectory(`${home}/userdata/triage`)).length).toBe(1);
          } else {
            expect(Result.isFailure(result)).toBe(true);
            if (Result.isFailure(result))
              expect(result.failure.message).toContain("Triage is not available in BotDuetDot");
            expect(yield* fs.readDirectory(home)).toEqual([]);
          }
        }).pipe(
          Effect.provide(ConfigProvider.layer(ConfigProvider.fromEnv({ env: {} }))),
          Effect.provideService(HostProcess.Environment, { PATH: "" }),
          Effect.provide(NodeServices.layer),
          Effect.scoped,
        ),
      );
    }),
);
