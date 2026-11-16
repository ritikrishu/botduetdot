import { expect, it } from "@effect/vitest";
import { vi } from "vite-plus/test";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import * as Result from "effect/Result";
import * as HostProcess from "@t3tools/shared/HostProcess";
import { HttpClient, HttpClientResponse } from "effect/http";
import * as ProcessRunner from "../processRunner.ts";

async function loadBrand(id: "upstream" | "standalone") {
  vi.resetModules();
  vi.doMock("@t3tools/contracts/brand", async (importOriginal) => {
    const original = await importOriginal<typeof import("@t3tools/contracts/brand")>();
    return { ...original, BRAND: original.resolveBrandProfile(id) };
  });
  return import("./npmRelease.ts");
}

it.effect.each(["upstream", "standalone"] as const)(
  "%s gates direct release lookups before HTTP or npm",
  (id) =>
    Effect.gen(function* () {
      const NpmRelease = yield* Effect.promise(() => loadBrand(id));
      const urls: string[] = [];
      const run = vi.fn(() => Effect.die("npm must not run"));
      yield* Effect.suspend(() =>
        Effect.gen(function* () {
          const service = yield* NpmRelease.make();
          const result = yield* service.get({ spec: "latest" }).pipe(Effect.result);
          if (id === "upstream") {
            expect(Result.getOrThrow(result)).toEqual({ version: "0.1.9" });
            expect(urls).toEqual(["https://registry.npmjs.org/t3/latest"]);
          } else {
            expect(Result.isFailure(result)).toBe(true);
            if (Result.isFailure(result))
              expect(result.failure.reason).toBe(
                "Release lookups are not available in BotDuetDot.",
              );
            expect(urls).toEqual([]);
          }
          expect(run).not.toHaveBeenCalled();
        }).pipe(
          Effect.provideService(ProcessRunner.ProcessRunner, { run }),
          Effect.provideService(
            HttpClient.HttpClient,
            HttpClient.make((request) => {
              urls.push(request.url);
              return Effect.succeed(
                HttpClientResponse.fromWeb(request, new Response('{"version":"0.1.9"}')),
              );
            }),
          ),
          Effect.provideService(HostProcess.Environment, { PATH: "" }),
          Effect.provide(NodeServices.layer),
          Effect.scoped,
        ),
      );
    }),
);
