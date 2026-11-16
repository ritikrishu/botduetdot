import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Stream from "effect/Stream";
import { HttpClient, HttpClientResponse } from "effect/http";
import { ChildProcessSpawner } from "effect/process";
import { vi } from "vite-plus/test";

import * as ServerSecretStore from "../auth/ServerSecretStore.ts";
import * as ManagedEndpointRuntime from "./ManagedEndpointRuntime.ts";

it.effect.each(["upstream", "standalone"] as const)(
  "%s only probes a persisted tunnel when Connect is available",
  (id) =>
    Effect.gen(function* () {
      vi.resetModules();
      vi.doMock("@t3tools/contracts/brand", async (importOriginal) => {
        const original = await importOriginal<typeof import("@t3tools/contracts/brand")>();
        return { ...original, BRAND: original.resolveBrandProfile(id) };
      });
      const reachability = yield* Effect.promise(() => import("./ConnectReachability.ts"));
      const requests: string[] = [];
      const reads: string[] = [];
      const result = yield* Effect.gen(function* () {
        return yield* (yield* reachability.ConnectReachability).check;
      }).pipe(
        Effect.provide(reachability.layer),
        Effect.provide([
          Layer.mock(ServerSecretStore.ServerSecretStore)({
            get: (name) =>
              Effect.sync(() => reads.push(name)).pipe(
                Effect.andThen(Effect.succeedSome(new TextEncoder().encode("persisted-config"))),
              ),
          }),
          Layer.mock(ManagedEndpointRuntime.CloudManagedEndpointRuntime)({
            inspectConnector: Effect.succeed({
              pid: 123,
              readyConnections: 4,
              hostname: "persisted.example.test",
              protocol: "quic",
            }),
            readinessChanged: Stream.empty,
          }),
          Layer.mock(ChildProcessSpawner.ChildProcessSpawner)({}),
          Layer.succeed(
            HttpClient.HttpClient,
            HttpClient.make((request) =>
              Effect.sync(() => {
                requests.push(request.url);
                return HttpClientResponse.fromWeb(request, new Response("ok"));
              }),
            ),
          ),
        ]),
        Effect.scoped,
      );
      if (id === "standalone") {
        expect(result).toMatchObject({ status: "unreachable", cause: "not_linked" });
        expect(reads).toEqual([]);
        expect(requests).toEqual([]);
      } else {
        expect(result.status).toBe("reachable");
        expect(reads).toEqual(["cloud-endpoint-runtime-config"]);
        expect(requests).toEqual(["https://persisted.example.test/.well-known/t3/environment"]);
      }
    }),
);
