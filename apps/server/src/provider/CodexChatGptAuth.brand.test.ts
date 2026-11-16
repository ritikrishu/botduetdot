import { expect, it } from "@effect/vitest";
import { vi } from "vite-plus/test";
import * as NodeCrypto from "@effect/platform-node/NodeCrypto";
import { EnvironmentId, ProviderInstanceId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Stream from "effect/Stream";
import { HttpClient, HttpClientResponse } from "effect/http";
import * as ServerSecretStore from "../auth/ServerSecretStore.ts";
import * as ServerEnvironment from "../environment/ServerEnvironment.ts";

async function loadBrand(id: "upstream" | "standalone") {
  vi.resetModules();
  vi.doMock("@t3tools/contracts/brand", async (importOriginal) => {
    const original = await importOriginal<typeof import("@t3tools/contracts/brand")>();
    return { ...original, BRAND: original.resolveBrandProfile(id) };
  });
  return import("./CodexChatGptAuth.ts");
}

it.effect.each(["upstream", "standalone"] as const)(
  "%s sends its own ChatGPT OAuth identity with PKCE",
  (id) =>
    Effect.gen(function* () {
      const { makeCodexChatGptAuth } = yield* Effect.promise(() => loadBrand(id));
      const urls: string[] = [];
      yield* Effect.suspend(() =>
        Effect.gen(function* () {
          const auth = yield* makeCodexChatGptAuth({
            instanceId: ProviderInstanceId.make(`brand-${id}`),
          });
          yield* auth.controller.start(
            "owner",
            Effect.void,
            undefined,
            "http://localhost:7001",
            "client",
          );
          const state = yield* auth.controller.subscribe("owner").pipe(
            Stream.filter((state) => state.phase === "waiting" || state.phase === "failed"),
            Stream.runHead,
            Effect.map(Option.getOrThrow),
          );
          expect(state.phase).toBe("waiting");
          const authorization = new URL(state.authorizationUrl!);
          expect(authorization.origin).toBe("https://auth.openai.com");
          expect(authorization.searchParams.get("agent_name_hint")).toBe(
            id === "upstream" ? "T3 Code" : "BotDuetDot",
          );
          expect(authorization.searchParams.get("client_id")).toBe("dynamic_agent_client");
          expect(authorization.searchParams.get("code_challenge_method")).toBe("S256");
          expect(authorization.searchParams.get("code_challenge")).toMatch(/^[A-Za-z0-9_-]{43}$/);
          expect(authorization.searchParams.get("ext_agent_host_id")).toBe(
            "urn:uuid:brand-environment",
          );
        }).pipe(
          Effect.provideService(ServerEnvironment.ServerEnvironmentIdentity, {
            getEnvironmentId: Effect.succeed(EnvironmentId.make("brand-environment")),
          }),
          Effect.provideService(ServerSecretStore.ServerSecretStore, {
            get: () => Effect.succeedNone,
            set: () => Effect.die("authorization must not save credentials yet"),
            create: () => Effect.die("unused"),
            remove: () => Effect.void,
            getOrCreateRandom: () => Effect.die("unused"),
          }),
          Effect.provideService(
            HttpClient.HttpClient,
            HttpClient.make((request) => {
              urls.push(request.url);
              return Effect.succeed(
                HttpClientResponse.fromWeb(
                  request,
                  Response.json({
                    issuer: "https://auth.openai.com",
                    authorization_endpoint: "https://auth.openai.com/authorize",
                    token_endpoint: "https://auth.openai.com/token",
                    jwks_uri: "https://auth.openai.com/jwks",
                  }),
                ),
              );
            }),
          ),
          Effect.provide(NodeCrypto.layer),
          Effect.scoped,
        ),
      );
      expect(urls).toHaveLength(1);
    }),
);
