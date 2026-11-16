import * as NodeCrypto from "@effect/platform-node/NodeCrypto";
import { expect, it } from "@effect/vitest";
import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as TestClock from "effect/testing/TestClock";
import * as Stream from "effect/Stream";
import * as FetchHttpClient from "effect/http/FetchHttpClient";
import { vi } from "vite-plus/test";

import * as ServerSecretStore from "../auth/ServerSecretStore.ts";
import * as EnvironmentKeys from "../cloud/environmentKeys.ts";
import * as ServerEnvironment from "../environment/ServerEnvironment.ts";
import * as ThreadManagement from "../orchestration-v2/ThreadManagementService.ts";
import * as ProjectService from "../project/ProjectService.ts";
import { ServerActivation } from "../serverActivation.ts";

it.effect.each(["upstream", "standalone"] as const)(
  "%s gates activity publishing independently of CloudLink startup",
  (id) =>
    Effect.gen(function* () {
      vi.resetModules();
      vi.doMock("@t3tools/contracts/brand", async (importOriginal) => {
        const original = await importOriginal<typeof import("@t3tools/contracts/brand")>();
        return { ...original, BRAND: original.resolveBrandProfile(id) };
      });
      const relay = yield* Effect.promise(() => import("./AgentAwarenessRelay.ts"));
      const values = new Map([
        ["cloud-relay-url", "https://relay.example.test"],
        ["cloud-relay-environment-credential", "credential"],
        ["cloud-publish-agent-activity", "true"],
      ]);
      const reads: string[] = [];
      const requests: string[] = [];
      yield* Effect.gen(function* () {
        const awareness = yield* relay.AgentAwarenessRelay;
        yield* awareness.start();
        yield* awareness.requestCatchUp();
        yield* awareness.publishThread(ThreadId.make("removed-thread"));
        yield* TestClock.adjust("5 seconds");
        yield* awareness.drain;
      }).pipe(
        Effect.provide(relay.layer),
        Effect.provide([
          Layer.mock(ServerSecretStore.ServerSecretStore)({
            get: (name) =>
              Effect.sync(() => {
                reads.push(name);
                return Option.map(Option.fromUndefinedOr(values.get(name)), (value) =>
                  new TextEncoder().encode(value),
                );
              }),
          }),
          Layer.mock(EnvironmentKeys.EnvironmentSigningKey)({
            publicKey: "public-key",
            sign: () => Effect.succeed("proof"),
          }),
          Layer.mock(ServerEnvironment.ServerEnvironment)({
            getEnvironmentId: Effect.succeed(EnvironmentId.make("env_123")),
          }),
          Layer.mock(ThreadManagement.ThreadManagementService)({
            getAgentAwarenessSnapshot: () => Effect.succeed({ snapshotSequence: 0, threads: [] }),
            streamDomainEvents: Stream.empty,
          }),
          Layer.mock(ProjectService.ProjectService)({}),
          Layer.succeed(ServerActivation, Effect.never),
        ]),
        Effect.provideService(FetchHttpClient.Fetch, (input) => {
          requests.push(String(input));
          return Promise.resolve(Response.json({ ok: true }));
        }),
        Effect.provide(NodeCrypto.layer),
        Effect.scoped,
      );
      if (id === "standalone") {
        expect(reads).toEqual([]);
        expect(requests).toEqual([]);
      } else {
        expect(reads).toContain("cloud-relay-url");
        expect(requests).toHaveLength(1);
        expect(requests[0]).toContain("https://relay.example.test/");
      }
    }),
);
