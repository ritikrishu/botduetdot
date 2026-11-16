import { expect, it } from "@effect/vitest";
import { vi } from "vite-plus/test";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as NodeCrypto from "@effect/platform-node/NodeCrypto";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { HttpClient, HttpClientResponse } from "effect/http";
import * as HostProcess from "@t3tools/shared/HostProcess";
import * as ServerConfig from "../config.ts";
import * as ManagedPolicy from "../policy/ManagedPolicy.ts";

async function loadBrand(id: "upstream" | "standalone") {
  vi.resetModules();
  vi.doMock("@t3tools/contracts/brand", async (importOriginal) => {
    const original = await importOriginal<typeof import("@t3tools/contracts/brand")>();
    return { ...original, BRAND: original.resolveBrandProfile(id) };
  });
  return import("./AnalyticsService.ts");
}

it.effect.each([
  { id: "upstream", env: {}, sends: true, host: "https://ingest.t3.codes/batch/" },
  { id: "standalone", env: {}, sends: false },
  { id: "standalone", env: { T3CODE_TELEMETRY_ENABLED: "1" }, sends: false },
  {
    id: "standalone",
    env: { T3CODE_TELEMETRY_ENABLED: "1", T3CODE_POSTHOG_KEY: "owner-key" },
    sends: false,
  },
  {
    id: "standalone",
    env: { T3CODE_TELEMETRY_ENABLED: "1", T3CODE_POSTHOG_HOST: "https://owner.example.test" },
    sends: false,
  },
  {
    id: "standalone",
    env: { T3CODE_POSTHOG_KEY: "owner-key", T3CODE_POSTHOG_HOST: "https://owner.example.test" },
    sends: false,
  },
  {
    id: "standalone",
    env: {
      T3CODE_TELEMETRY_ENABLED: "1",
      T3CODE_POSTHOG_KEY: "owner-key",
      T3CODE_POSTHOG_HOST: "https://owner.example.test",
    },
    sends: true,
    host: "https://owner.example.test/batch/",
  },
] as const)("$id analytics requires its configured opt-in: $env", ({ id, env, sends, host }) =>
  Effect.gen(function* () {
    const AnalyticsService = yield* Effect.promise(() => loadBrand(id));
    const urls: string[] = [];
    yield* Effect.suspend(() =>
      Effect.gen(function* () {
        const analytics = yield* AnalyticsService.make;
        yield* analytics.record("brand.test");
        yield* analytics.flush;
      }).pipe(
        Effect.provideService(HostProcess.Environment, {}),
        Effect.provideService(
          HttpClient.HttpClient,
          HttpClient.make((request) => {
            urls.push(request.url);
            return Effect.succeed(
              HttpClientResponse.fromWeb(request, new Response(null, { status: 204 })),
            );
          }),
        ),
        Effect.provide(
          Layer.mergeAll(
            ConfigProvider.layer(ConfigProvider.fromEnv({ env })),
            ManagedPolicy.layerTest(),
            ServerConfig.layerTest(process.cwd(), { prefix: "brand-analytics-" }),
          ).pipe(Layer.provideMerge(Layer.mergeAll(NodeServices.layer, NodeCrypto.layer))),
        ),
        Effect.scoped,
      ),
    );
    expect(urls).toEqual(sends ? [host] : []);
  }),
);
