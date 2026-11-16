import { expect, it } from "@effect/vitest";
import { vi } from "vite-plus/test";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import { HttpClient, HttpClientResponse } from "effect/http";
import * as ServerConfig from "../config.ts";
import * as ServerSettings from "../serverSettings.ts";

async function loadBrand(id: "upstream" | "standalone") {
  vi.resetModules();
  vi.doMock("@t3tools/contracts/brand", async (importOriginal) => {
    const original = await importOriginal<typeof import("@t3tools/contracts/brand")>();
    return { ...original, BRAND: original.resolveBrandProfile(id) };
  });
  return import("./ModelManifest.ts");
}

it.effect.each(["upstream", "standalone"] as const)(
  "%s chooses bundled-only manifests before reading a cache or fetching",
  (id) =>
    Effect.gen(function* () {
      const ModelManifest = yield* Effect.promise(() => loadBrand(id));
      const urls: string[] = [];
      yield* Effect.suspend(() =>
        Effect.gen(function* () {
          const config = yield* ServerConfig.ServerConfig;
          const fs = yield* FileSystem.FileSystem;
          const cached = {
            version: 1 as const,
            updatedAt: "2099-01-01T00:00:00Z",
            currentModels: { synthetic: ["cached-model"] },
          };
          yield* fs.writeFileString(
            `${config.stateDir}/model-manifest.json`,
            JSON.stringify({ fetchedAtMs: -10_000_000, manifest: cached }),
          );
          const service = yield* ModelManifest.make;
          expect(yield* service.current).toEqual(
            id === "upstream" ? cached : ModelManifest.BUNDLED_MODEL_MANIFEST,
          );
          for (const refresh of [service.refresh, service.forceRefresh, service.refreshOnDemand]) {
            expect(yield* refresh).toEqual(
              id === "upstream" ? cached : ModelManifest.BUNDLED_MODEL_MANIFEST,
            );
          }
          yield* service.refreshInBackground;
          expect(urls).toEqual(
            id === "upstream"
              ? [
                  "https://raw.githubusercontent.com/pingdotgg/t3code/main/apps/server/src/provider/model-manifest.json",
                  "https://raw.githubusercontent.com/pingdotgg/t3code/main/apps/server/src/provider/model-manifest.json",
                ]
              : [],
          );
        }).pipe(
          Effect.provideService(
            HttpClient.HttpClient,
            HttpClient.make((request) => {
              urls.push(request.url);
              return Effect.succeed(
                HttpClientResponse.fromWeb(
                  request,
                  Response.json(ModelManifest.BUNDLED_MODEL_MANIFEST),
                ),
              );
            }),
          ),
          Effect.provide(
            Layer.mergeAll(
              ServerSettings.layerTest({}),
              ServerConfig.layerTest(process.cwd(), { prefix: "brand-manifest-" }),
            ).pipe(Layer.provideMerge(NodeServices.layer)),
          ),
          Effect.scoped,
        ),
      );
    }),
);
