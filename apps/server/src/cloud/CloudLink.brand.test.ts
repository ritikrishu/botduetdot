import * as NodeCrypto from "@effect/platform-node/NodeCrypto";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, it } from "@effect/vitest";
import {
  AuthSessionId,
  AuthRelayWriteScope,
  EnvironmentAuthenticatedAuth,
  EnvironmentAuthenticatedPrincipal,
  EnvironmentHttpApi,
  EnvironmentId,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Result from "effect/Result";
import * as Stream from "effect/Stream";
import { HttpClient, HttpClientResponse, HttpServer } from "effect/http";
import * as HttpApi from "effect/http-api/HttpApi";
import * as HttpApiTest from "effect/http-api/HttpApiTest";
import * as NetAddress from "effect/net/NetAddress";
import { vi } from "vite-plus/test";

import * as EnvironmentAuth from "../auth/EnvironmentAuth.ts";
import * as ServerSecretStore from "../auth/ServerSecretStore.ts";
import * as ServerConfig from "../config.ts";
import * as ServerEnvironment from "../environment/ServerEnvironment.ts";
import * as ManagedPolicy from "../policy/ManagedPolicy.ts";
import * as AgentAwarenessRelay from "../relay/AgentAwarenessRelay.ts";
import { CLOUD_CLI_DESIRED_LINK_SECRET } from "./CliState.ts";
import * as CliTokenManager from "./CliTokenManager.ts";
import * as ConnectReachability from "./ConnectReachability.ts";
import * as EnvironmentKeys from "./environmentKeys.ts";
import * as ManagedEndpointRuntime from "./ManagedEndpointRuntime.ts";

async function loadBrand(id: "upstream" | "standalone") {
  vi.resetModules();
  vi.doMock("@t3tools/contracts/brand", async (importOriginal) => {
    const original = await importOriginal<typeof import("@t3tools/contracts/brand")>();
    return { ...original, BRAND: original.resolveBrandProfile(id) };
  });
  return {
    cloud: await import("./CloudLink.ts"),
    config: await import("./config.ts"),
    http: await import("./http.ts"),
  };
}

class ConnectTestApi extends HttpApi.make("environment").add(EnvironmentHttpApi.groups.connect) {}

const origin = "http://127.0.0.1:3773";
const endpoint = {
  providerKind: "cloudflare_tunnel" as const,
  httpBaseUrl: "https://environment.example.test",
  wsBaseUrl: "wss://environment.example.test/ws",
};
const runtimeConfig = {
  providerKind: "cloudflare_tunnel" as const,
  connectorToken: "persisted-token",
  tunnelId: "persisted-tunnel",
};
const publicKey =
  "-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEAqZ2u2LjMoAyG2QTHXmITJ9w6RzZtVUAv394XCcPV0zE=\n-----END PUBLIC KEY-----";

it.effect.each([
  { id: "upstream", policy: "unmanaged" },
  { id: "standalone", policy: "unmanaged" },
  { id: "standalone", policy: "connect-disabled" },
] as const)(
  "$id ($policy) reconciles seeded Connect state without changing the other app's secrets",
  ({ id, policy }) =>
    Effect.gen(function* () {
      const { cloud, config, http } = yield* Effect.promise(() => loadBrand(id));
      yield* Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const serverConfig = yield* ServerConfig.ServerConfig;
        const secrets = yield* ServerSecretStore.ServerSecretStore;
        const entries = [
          [config.CLOUD_ENDPOINT_RUNTIME_CONFIG, JSON.stringify(runtimeConfig)],
          [config.RELAY_URL_SECRET, "https://relay.example.test"],
          [config.RELAY_ISSUER_SECRET, "https://relay.example.test"],
          [config.RELAY_ENVIRONMENT_CREDENTIAL_SECRET, "persisted-credential"],
          [config.CLOUD_LINKED_USER_ID, "user-123"],
          [config.CLOUD_MINT_PUBLIC_KEY, publicKey],
          [config.PUBLISH_AGENT_ACTIVITY_SECRET, "true"],
          [config.HOLD_WEBHOOKS_WHILE_OFFLINE_SECRET, "true"],
          [CLOUD_CLI_DESIRED_LINK_SECRET, "true"],
          [
            config.CLOUD_ENDPOINT_CONFIRMED_ORIGIN,
            JSON.stringify({
              config: runtimeConfig,
              origin: { localHttpHost: "127.0.0.1", localHttpPort: 3773 },
            }),
          ],
        ] as const;
        for (const [name, value] of entries) {
          yield* secrets.set(name, new TextEncoder().encode(value));
        }
        const snapshot = Effect.gen(function* () {
          const files = (yield* fs.readDirectory(serverConfig.secretsDir)).sort();
          return yield* Effect.forEach(files, (file) =>
            fs
              .readFile(`${serverConfig.secretsDir}/${file}`)
              .pipe(Effect.map((bytes) => [file, Array.from(bytes)] as const)),
          );
        });
        const before = yield* snapshot;
        const reads: string[] = [];
        const mutations: string[] = [];
        const requests: string[] = [];
        const applied: unknown[] = [];
        const observedSecrets: ServerSecretStore.ServerSecretStore["Service"] = {
          get: (name) =>
            Effect.suspend(() => {
              reads.push(name);
              return secrets.get(name);
            }),
          set: (name, value) =>
            Effect.suspend(() => {
              mutations.push(`set:${name}`);
              return secrets.set(name, value);
            }),
          create: (name, value) =>
            Effect.suspend(() => {
              mutations.push(`create:${name}`);
              return secrets.create(name, value);
            }),
          remove: (name) =>
            Effect.suspend(() => {
              mutations.push(`remove:${name}`);
              return secrets.remove(name);
            }),
          getOrCreateRandom: (...args) =>
            Effect.suspend(() => {
              mutations.push(`random:${args[0]}`);
              return secrets.getOrCreateRandom(...args);
            }),
        };
        const connected = id === "upstream";
        yield* Effect.gen(function* () {
          const link = yield* cloud.CloudLink;
          expect(yield* link.startManagedTunnelIfOriginConfirmed(origin)).toBe(connected);
          expect(
            yield* link.startManagedTunnelIfOriginConfirmed(origin, {
              requireConfirmedOrigin: false,
            }),
          ).toBe(connected);
          expect((yield* link.registerManagedTunnelRecovery(origin)).status).toBe(
            connected ? "ready" : "not_linked",
          );
          expect(yield* link.recoverManagedTunnel(origin)).toBe(connected);
          expect(yield* config.readRelayConnection).toEqual(
            connected
              ? {
                  url: "https://relay.example.test",
                  environmentCredential: "persisted-credential",
                }
              : null,
          );
          expect(yield* config.readAgentActivityPublishingActive(observedSecrets)).toBe(connected);
          if (!connected) {
            expect(yield* link.reconcileDesiredLinkIfStillDesired(origin)).toBeNull();
            expect(yield* link.linkState()).toMatchObject({
              linked: false,
              managedTunnelActive: false,
              publishAgentActivity: false,
              holdWebhooksWhileOffline: false,
              relayUrl: null,
            });
            const principal = yield* EnvironmentAuthenticatedPrincipal;
            const client = yield* HttpApiTest.groups(ConnectTestApi, ["connect"]).pipe(
              Effect.provide([
                http.layer.pipe(
                  Layer.provideMerge(
                    Layer.succeed(EnvironmentAuthenticatedAuth, (effect) =>
                      effect.pipe(
                        Effect.provideService(EnvironmentAuthenticatedPrincipal, principal),
                      ),
                    ),
                  ),
                ),
                HttpServer.layerServices,
              ]),
            );
            const refusals: ReadonlyArray<
              Effect.Effect<unknown, { readonly message: string; readonly _tag: string }>
            > = [
              client.connect.linkProof({
                headers: {},
                payload: {
                  challenge: "challenge",
                  relayIssuer: "https://relay.example.test",
                  endpoint,
                  origin: { localHttpHost: "127.0.0.1", localHttpPort: 3773 },
                },
              }),
              client.connect.relayConfig({
                headers: {},
                payload: {
                  relayUrl: "https://replacement.example.test",
                  cloudUserId: "user-123",
                  environmentCredential: "replacement-credential",
                  cloudMintPublicKey: publicKey,
                  endpointRuntime: runtimeConfig,
                },
              }),
              client.connect.preferences({
                headers: {},
                payload: { publishAgentActivity: true, holdWebhooksWhileOffline: true },
              }),
              client.connect.health({ payload: { proof: "relay-signed-proof" } }),
              client.connect.t3MintCredential({ payload: { proof: "relay-signed-proof" } }),
            ];
            for (const operation of refusals) {
              const result = yield* operation.pipe(Effect.result);
              expect(Result.isFailure(result)).toBe(true);
              if (Result.isFailure(result)) {
                expect(result.failure.message).toBe("T3 Connect is not available in BotDuetDot.");
                expect(result.failure._tag).toBe("EnvironmentHttpForbiddenError");
              }
            }
            yield* link.unlink();
          }
          const result = yield* link
            .applyRelayConfig({
              relayUrl: "https://replacement.example.test",
              cloudUserId: "user-123",
              environmentCredential: "replacement-credential",
              cloudMintPublicKey: publicKey,
              endpointRuntime: runtimeConfig,
            })
            .pipe(Effect.result);
          expect(Result.isSuccess(result)).toBe(connected);
          if (Result.isFailure(result)) {
            expect(result.failure.message).toBe("T3 Connect is not available in BotDuetDot.");
            expect(cloud.shouldRetryCloudLink(result.failure)).toBe(false);
          }
          expect(yield* link.releaseManagedTunnelOnShutdown()).toBe(connected);
        }).pipe(
          Effect.provide(cloud.layer),
          Effect.provide([
            ManagedPolicy.layerTest(
              policy === "unmanaged"
                ? undefined
                : {
                    schemaVersion: 1,
                    organization: "Test",
                    limits: { connect: false },
                  },
            ),
            Layer.mock(EnvironmentAuth.EnvironmentAuth)({}),
            Layer.succeed(EnvironmentAuthenticatedPrincipal, {
              sessionId: AuthSessionId.make("test-session"),
              subject: "desktop-bootstrap",
              method: "bearer-access-token",
              scopes: new Set([AuthRelayWriteScope]),
            }),
            Layer.mock(ConnectReachability.ConnectReachability)({ latest: Effect.succeedNone }),
            Layer.mock(EnvironmentKeys.EnvironmentSigningKey)({
              publicKey,
              sign: () => Effect.succeed("test-signature"),
            }),
            Layer.mock(ServerEnvironment.ServerEnvironment)({
              getEnvironmentId: Effect.succeed(EnvironmentId.make("env_123")),
            }),
            Layer.mock(AgentAwarenessRelay.AgentAwarenessRelay)({
              requestCatchUp: () => Effect.void,
            }),
            Layer.mock(CliTokenManager.CloudCliTokenManager)({
              getExisting: Effect.succeedSome({
                accessToken: "cli-token",
                refreshToken: "refresh-token",
                expiresAtEpochMs: Number.MAX_SAFE_INTEGER,
              }),
            }),
            Layer.mock(HttpServer.HttpServer)({
              address: NetAddress.inetAddressFromIpStringUnsafe("127.0.0.1", 3773),
            }),
            Layer.mock(ManagedEndpointRuntime.CloudManagedEndpointRuntime)({
              applyConfig: (value) =>
                Effect.sync(() => {
                  applied.push(value);
                  return value === null
                    ? { status: "disabled" as const }
                    : {
                        status: "running" as const,
                        providerKind: "cloudflare_tunnel" as const,
                        pid: 123,
                      };
                }),
              withLinkStateLock: (effect) => effect,
              inspectConnector: Effect.succeed(null),
              recoveryRequests: Stream.empty,
            }),
            Layer.succeed(
              HttpClient.HttpClient,
              HttpClient.make((request) =>
                Effect.sync(() => {
                  requests.push(`${request.method} ${request.url}`);
                  const body = request.url.endsWith("/recovery")
                    ? { status: "ready" }
                    : request.method === "DELETE"
                      ? { ok: true }
                      : { endpoint, endpointRuntime: runtimeConfig };
                  return HttpClientResponse.fromWeb(request, Response.json(body));
                }),
              ),
            ),
            Layer.succeed(ServerSecretStore.ServerSecretStore, observedSecrets),
          ]),
          Effect.scoped,
        );
        if (connected) {
          expect(requests).toEqual([
            "POST https://relay.example.test/v1/environments/env_123/tunnel/recovery",
            "POST https://relay.example.test/v1/environments/env_123/tunnel",
            "POST https://replacement.example.test/v1/environments/env_123/tunnel/recovery",
            "DELETE https://replacement.example.test/v1/client/environment-links/env_123/tunnel",
          ]);
          expect(applied).toContainEqual(runtimeConfig);
          expect(mutations).toContain(`set:${config.RELAY_URL_SECRET}`);
          expect(mutations).toContain(`remove:${config.CLOUD_ENDPOINT_RUNTIME_CONFIG}`);
        } else {
          expect(requests).toEqual([]);
          expect(applied).toEqual([]);
          expect(reads).toEqual([]);
          expect(mutations).toEqual([]);
          expect(yield* snapshot).toEqual(before);
        }
      }).pipe(
        Effect.provide(
          ServerSecretStore.layer.pipe(
            Layer.provideMerge(
              ServerConfig.layerTest(process.cwd(), { prefix: "brand-cloud-link-" }),
            ),
            Layer.provideMerge(Layer.mergeAll(NodeServices.layer, NodeCrypto.layer)),
          ),
        ),
        Effect.scoped,
      );
    }),
);
