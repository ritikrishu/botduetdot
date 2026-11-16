import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import { vi } from "vite-plus/test";

vi.mock("./lib/public-config.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./lib/public-config.ts")>()),
  loadRepoEnv: () => ({ T3CODE_BRAND: "standalone", GITHUB_REPOSITORY: "pingdotgg/t3code" }),
}));
import { createBuildConfig, resolveDesktopUpdateChannel } from "./build-desktop-artifact.ts";

it.effect(
  "generates standalone mac identity and a forced latest feed despite inherited GitHub repository",
  () =>
    Effect.gen(function* () {
      const version = "0.1.9-botduetdot.1";
      assert.equal(resolveDesktopUpdateChannel(version), "latest");
      const config = yield* createBuildConfig(
        "mac",
        "dmg",
        version,
        false,
        false,
        undefined,
        undefined,
        false,
        "arm64",
      );
      assert.equal(config.appId, "com.ritikrishu.botduetdot");
      assert.equal(config.productName, "BotDuetDot");
      assert.deepEqual(config.publish, [
        {
          provider: "github",
          owner: "ritikrishu",
          repo: "botduetdot",
          channel: "latest",
          releaseType: "release",
        },
      ]);
      assert.include(config.dmg, { title: `BotDuetDot ${version} Installer` });
      const mac = config.mac as Record<string, unknown>;
      assert.deepEqual(mac.target, ["dmg", "zip"]);
      assert.notProperty(mac, "provisioningProfile");
      assert.deepEqual(mac.protocols, [
        { name: "BotDuetDot", schemes: ["botduetdot", "botduetdot-dev"] },
        { name: "Web site URL", schemes: ["http", "https"], role: "Viewer" },
      ]);
    }).pipe(
      Effect.provide(NodeServices.layer),
      Effect.provideService(
        ConfigProvider.ConfigProvider,
        ConfigProvider.fromUnknown({ GITHUB_REPOSITORY: "pingdotgg/t3code" }),
      ),
    ),
);
