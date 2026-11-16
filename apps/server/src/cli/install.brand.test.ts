import { expect, it } from "@effect/vitest";
import { vi } from "vite-plus/test";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Result from "effect/Result";
import * as HostProcess from "@t3tools/shared/HostProcess";

async function loadBrand(id: "upstream" | "standalone") {
  vi.resetModules();
  vi.doMock("@t3tools/contracts/brand", async (importOriginal) => {
    const original = await importOriginal<typeof import("@t3tools/contracts/brand")>();
    return { ...original, BRAND: original.resolveBrandProfile(id) };
  });
  return import("./install.ts");
}

it.effect.each(["upstream", "standalone"] as const)(
  "%s prevents the headless installer from replacing an official CLI",
  (id) =>
    Effect.gen(function* () {
      const { installCli } = yield* Effect.promise(() => loadBrand(id));
      yield* Effect.suspend(() =>
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const home = yield* fs.makeTempDirectoryScoped({ prefix: "brand-install-" });
          const runtime = `${home}/runtime/versions/0.1.9/t3`;
          yield* fs.makeDirectory(`${home}/runtime/versions/0.1.9`, { recursive: true });
          yield* fs.writeFileString(runtime, "");
          const result = yield* installCli().pipe(
            Effect.provideService(HostProcess.HomeDirectory, home),
            Effect.provideService(HostProcess.Platform, "darwin"),
            Effect.provideService(HostProcess.IsExecutable, true),
            Effect.provideService(HostProcess.ExecutablePath, runtime),
            Effect.provideService(HostProcess.Environment, { PATH: "" }),
            Effect.result,
          );
          if (id === "upstream") {
            expect(Result.isSuccess(result)).toBe(true);
            expect(yield* fs.readLink(`${home}/.local/bin/t3`)).toBe(runtime);
          } else {
            expect(Result.isFailure(result)).toBe(true);
            if (Result.isFailure(result))
              expect(result.failure.message).toContain("Settings → CLI");
            expect(yield* fs.exists(`${home}/.local`)).toBe(false);
            expect(yield* fs.exists(`${home}/runtime/launchers`)).toBe(false);
          }
        }).pipe(Effect.provide(NodeServices.layer), Effect.scoped),
      );
    }),
);
