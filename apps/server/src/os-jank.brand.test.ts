import { expect, it } from "@effect/vitest";
import { vi } from "vite-plus/test";
import * as Effect from "effect/Effect";
import * as Path from "effect/Path";
import * as HostProcess from "@t3tools/shared/HostProcess";

async function loadBrand(id: "upstream" | "standalone") {
  vi.resetModules();
  vi.doMock("@t3tools/contracts/brand", async (importOriginal) => {
    const original = await importOriginal<typeof import("@t3tools/contracts/brand")>();
    return { ...original, BRAND: original.resolveBrandProfile(id) };
  });
  return import("./os-jank.ts");
}

it.effect.each(["upstream", "standalone"] as const)(
  "%s isolates the default home and preserves explicit homes",
  (id) =>
    Effect.gen(function* () {
      const { resolveBaseDir } = yield* Effect.promise(() => loadBrand(id));
      yield* Effect.suspend(() =>
        Effect.gen(function* () {
          expect(yield* resolveBaseDir(undefined)).toBe(
            `/fake/home/${id === "upstream" ? ".t3" : ".botduetdot"}`,
          );
          expect(yield* resolveBaseDir("  ")).toBe(
            `/fake/home/${id === "upstream" ? ".t3" : ".botduetdot"}`,
          );
          expect(yield* resolveBaseDir("/explicit/home")).toBe("/explicit/home");
          expect(yield* resolveBaseDir("~/custom")).toBe("/fake/home/custom");
        }).pipe(
          Effect.provide(Path.layer),
          Effect.provideService(HostProcess.HomeDirectory, "/fake/home"),
        ),
      );
    }),
);
