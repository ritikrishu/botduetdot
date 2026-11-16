import { expect, it } from "@effect/vitest";
import { vi } from "vite-plus/test";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as HostProcess from "@t3tools/shared/HostProcess";
import packageJson from "../../package.json" with { type: "json" };

async function loadBrand(id: "upstream" | "standalone") {
  vi.resetModules();
  vi.doMock("@t3tools/contracts/brand", async (importOriginal) => {
    const original = await importOriginal<typeof import("@t3tools/contracts/brand")>();
    return { ...original, BRAND: original.resolveBrandProfile(id) };
  });
  return import("./invocation.ts");
}

it.effect.each(["upstream", "standalone"] as const)(
  "%s uses its own CLI and does not adopt the other product's npm launcher",
  (id) =>
    Effect.gen(function* () {
      const { resolveHostCliCommand, resolveEntryPath, resolveServerInstallation } =
        yield* Effect.promise(() => loadBrand(id));
      yield* Effect.suspend(() =>
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const home = yield* fs.realPath(
            yield* fs.makeTempDirectoryScoped({ prefix: "brand-cli-" }),
          );
          const packageRoot = `${home}/lib/node_modules/t3`;
          const launcher = `${packageRoot}/bin/t3.mjs`;
          yield* fs.makeDirectory(`${packageRoot}/bin`, { recursive: true });
          yield* fs.makeDirectory(`${home}/bin`);
          yield* fs.writeFileString(launcher, "");
          yield* fs.writeFileString(
            `${packageRoot}/package.json`,
            JSON.stringify({
              name: "t3",
              version: packageJson.version,
              bin: { t3: "./bin/t3.mjs" },
            }),
          );
          yield* fs.symlink(launcher, `${home}/bin/t3`);
          yield* Effect.gen(function* () {
            expect(yield* resolveEntryPath).toBe(
              id === "upstream" ? launcher : "/brand/server.mjs",
            );
            expect(yield* resolveServerInstallation).toEqual(
              id === "upstream" ? { kind: "npm-global", prefix: home } : null,
            );
            expect((yield* resolveHostCliCommand("serve")).command).toBe(
              id === "upstream" ? "t3 serve" : "botduetdot serve",
            );
          }).pipe(
            Effect.provideService(HostProcess.Arguments, ["node", "/brand/server.mjs"]),
            Effect.provideService(HostProcess.IsExecutable, false),
            Effect.provideService(HostProcess.Platform, "darwin"),
            Effect.provideService(HostProcess.Environment, {
              PATH: `${home}/bin`,
              T3CODE_NPM_LAUNCHER_PATH: launcher,
            }),
          );
        }).pipe(Effect.provide(NodeServices.layer), Effect.scoped),
      );
    }),
);
