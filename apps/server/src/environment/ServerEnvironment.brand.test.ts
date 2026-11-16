import { expect, it } from "@effect/vitest";
import { vi } from "vite-plus/test";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as NodeCrypto from "@effect/platform-node/NodeCrypto";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as HostProcess from "@t3tools/shared/HostProcess";
import * as ServerConfig from "../config.ts";
import * as ServerSecretStore from "../auth/ServerSecretStore.ts";

async function loadBrand(id: "upstream" | "standalone") {
  vi.resetModules();
  vi.doMock("@t3tools/contracts/brand", async (importOriginal) => {
    const original = await importOriginal<typeof import("@t3tools/contracts/brand")>();
    return { ...original, BRAND: original.resolveBrandProfile(id) };
  });
  return import("./ServerEnvironment.ts");
}

it.effect.each(["upstream", "standalone"] as const)(
  "%s advertises only its enabled server features",
  (id) =>
    Effect.gen(function* () {
      const ServerEnvironment = yield* Effect.promise(() => loadBrand(id));
      yield* Effect.suspend(() =>
        Effect.gen(function* () {
          const config = yield* ServerConfig.ServerConfig;
          const descriptor = yield* Effect.gen(function* () {
            const service = yield* ServerEnvironment.ServerEnvironment;
            return yield* service.getDescriptor;
          }).pipe(
            Effect.provide(ServerEnvironment.layer.pipe(Layer.provide(ServerSecretStore.layer))),
            Effect.provideService(ServerConfig.ServerConfig, {
              ...config,
              mode: "desktop",
              desktopTelemetryControlFd: 3,
            }),
          );
          for (const feature of [
            "triage",
            "npmReleaseLookup",
            "desktopAppChannelSwitch",
          ] as const) {
            if (id === "upstream") expect(descriptor.capabilities[feature]).toBe(true);
            else expect(descriptor.capabilities).not.toHaveProperty(feature);
          }
          expect(descriptor.capabilities.desktopAppUpdate).toBe(true);
        }).pipe(
          Effect.provideService(HostProcess.Environment, {}),
          Effect.provide(
            ServerConfig.layerTest(process.cwd(), { prefix: "brand-capabilities-" }).pipe(
              Layer.provideMerge(Layer.mergeAll(NodeServices.layer, NodeCrypto.layer)),
            ),
          ),
          Effect.scoped,
        ),
      );
    }),
);
