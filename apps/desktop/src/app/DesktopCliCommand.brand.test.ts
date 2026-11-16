import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import * as HostProcess from "@t3tools/shared/HostProcess";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import { vi } from "vite-plus/test";

vi.mock("@t3tools/contracts/brand", async (importOriginal) => {
  const original = await importOriginal<typeof import("@t3tools/contracts/brand")>();
  const { STANDALONE_BRAND } = await import("@t3tools/contracts/brandProfiles");
  return { ...original, BRAND: STANDALONE_BRAND };
});
import * as DesktopCliCommand from "./DesktopCliCommand.ts";
import * as DesktopEnvironment from "./DesktopEnvironment.ts";

it.effect("installs and removes the standalone CLI beside the official CLI", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const home = yield* fs.makeTempDirectoryScoped();
    const baseDir = path.join(home, ".botduetdot");
    const bin = path.join(home, ".local/bin");
    yield* fs.makeDirectory(bin, { recursive: true });
    yield* fs.makeDirectory(path.join(baseDir, "userdata"), { recursive: true });
    const official = path.join(bin, "t3");
    yield* fs.writeFileString(official, "official sentinel", { mode: 0o755 });
    const command = yield* DesktopCliCommand.make.pipe(
      Effect.provideService(DesktopEnvironment.DesktopEnvironment, {
        path,
        platform: "darwin",
        isPackaged: true,
        homeDirectory: home,
        baseDir,
        stateDir: path.join(baseDir, "userdata"),
        desktopSettingsPath: path.join(baseDir, "userdata/desktop-settings.json"),
        serverRoot: "/opt/BotDuetDot/resources/app.asar",
        appImagePath: Option.none(),
      } as unknown as DesktopEnvironment.DesktopEnvironment["Service"]),
      Effect.provideService(HostProcess.Environment, { PATH: bin, SHELL: "/bin/zsh" }),
    );
    yield* command.installOnFirstLaunch;
    const state = yield* command.state;
    assert.equal(state.installedPath, path.join(bin, "botduetdot"));
    assert.equal(state.launcherPath, path.join(baseDir, "bin/botduetdot"));
    assert.equal(yield* fs.readLink(path.join(bin, "botduetdot")), state.launcherPath);
    yield* command.uninstall;
    assert.isFalse(yield* fs.exists(path.join(bin, "botduetdot")));
    assert.equal(yield* fs.readFileString(official), "official sentinel");
  }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
);
