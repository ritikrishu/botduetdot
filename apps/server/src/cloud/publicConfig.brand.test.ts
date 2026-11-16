import { expect, it } from "@effect/vitest";
import { vi } from "vite-plus/test";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import * as Result from "effect/Result";

async function loadBrand(id: "upstream" | "standalone") {
  vi.resetModules();
  vi.doMock("@t3tools/contracts/brand", async (importOriginal) => {
    const original = await importOriginal<typeof import("@t3tools/contracts/brand")>();
    return { ...original, BRAND: original.resolveBrandProfile(id) };
  });
  return import("./publicConfig.ts");
}

it.effect.each(["upstream", "standalone"] as const)(
  "%s enforces runtime cloud overrides even with embedded fallbacks",
  (id) =>
    Effect.gen(function* () {
      const env = {
        T3CODE_RELAY_URL: "https://relay.example.test",
        T3CODE_HOSTED_APP_URL: "https://hosted.example.test",
        T3CODE_CLERK_PUBLISHABLE_KEY: "pk_test_Y2xlcmsuZXhhbXBsZS50ZXN0JA==",
        T3CODE_CLERK_CLI_OAUTH_CLIENT_ID: "oauth_client_runtime",
        T3CODE_RELAY_CLIENT_OTLP_TRACES_URL: "https://traces.example.test/v1/traces",
        T3CODE_RELAY_CLIENT_OTLP_TRACES_DATASET: "runtime",
        T3CODE_RELAY_CLIENT_OTLP_TRACES_TOKEN: "runtime-token",
        T3CODE_TELEMETRY_ENABLED: "true",
        T3CODE_OTEL_SDK_DISABLED: "false",
      };
      for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
      try {
        const config = yield* Effect.promise(() => loadBrand(id));
        const enabled = id === "upstream";
        expect(config.hasCloudPublicConfig).toBe(enabled);
        const tracing = config.resolveRelayClientTracingConfig(env, {
          tracesUrl: "https://embedded.example.test/v1/traces",
          tracesDataset: "embedded",
          tracesToken: "embedded-token",
        });
        expect(tracing).toEqual(
          enabled
            ? {
                tracesUrl: env.T3CODE_RELAY_CLIENT_OTLP_TRACES_URL,
                tracesDataset: "runtime",
                tracesToken: "runtime-token",
              }
            : null,
        );
        yield* Effect.suspend(() =>
          Effect.gen(function* () {
            for (const relay of [
              config.relayUrlConfig,
              config.makeRelayUrlConfig("https://embedded.example.test"),
            ]) {
              const result = yield* relay.pipe(Effect.result);
              if (enabled) expect(Result.getOrThrow(result)).toBe(env.T3CODE_RELAY_URL);
              else {
                expect(Result.isFailure(result)).toBe(true);
                if (Result.isFailure(result))
                  expect(result.failure.message).toContain(
                    "T3 Connect is not available in BotDuetDot",
                  );
              }
            }
            for (const oauth of [
              config.cloudCliOAuthConfig,
              config.makeCloudCliOAuthConfig({
                clerkPublishableKeyFallback: env.T3CODE_CLERK_PUBLISHABLE_KEY,
                clerkCliOAuthClientIdFallback: "embedded",
              }),
            ]) {
              const result = yield* oauth.pipe(Effect.result);
              if (enabled)
                expect(Result.getOrThrow(result)).toMatchObject({
                  clientId: "oauth_client_runtime",
                  tokenEndpoint: "https://clerk.example.test/oauth/token",
                });
              else expect(Result.isFailure(result)).toBe(true);
            }
            for (const hosted of [config.hostedAppUrlConfig, config.agentApprovalAppUrlConfig]) {
              expect(yield* hosted).toBe(
                enabled ? env.T3CODE_HOSTED_APP_URL : "https://app.botduetdot.invalid",
              );
            }
          }).pipe(Effect.provide(ConfigProvider.layer(ConfigProvider.fromEnv({ env })))),
        );
      } finally {
        vi.unstubAllEnvs();
      }
    }),
);

it.effect.each(["upstream", "standalone"] as const)(
  "%s keeps the correct nightly approval default",
  (id) =>
    Effect.gen(function* () {
      vi.stubGlobal("__T3CODE_BUILD_CHANNEL__", "nightly");
      try {
        const config = yield* Effect.promise(() => loadBrand(id));
        expect(
          yield* Effect.suspend(() =>
            config.agentApprovalAppUrlConfig.pipe(
              Effect.provide(ConfigProvider.layer(ConfigProvider.fromEnv({ env: {} }))),
            ),
          ),
        ).toBe(
          id === "upstream" ? "https://nightly.app.t3.codes" : "https://app.botduetdot.invalid",
        );
      } finally {
        vi.unstubAllGlobals();
      }
    }),
);
