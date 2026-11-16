import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Option from "effect/Option";
import { vi } from "vite-plus/test";

vi.mock("@t3tools/contracts/brand", async (importOriginal) => {
  const original = await importOriginal<typeof import("@t3tools/contracts/brand")>();
  const { STANDALONE_BRAND } = await import("@t3tools/contracts/brandProfiles");
  return { ...original, BRAND: STANDALONE_BRAND };
});
import { resolveUserDataPath } from "./DesktopUserData.ts";
import { resolveDesktopBaseDir } from "./DesktopStatePaths.ts";

it.effect.each([false, true])(
  "isolates standalone profiles without importing legacy data (dev=%s)",
  (isDevelopment) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped();
      for (const name of ["T3 Code (Alpha)", "T3 Code (Dev)", "t3code", "t3code-v2"]) {
        yield* fs.makeDirectory(path.join(root, name));
        yield* fs.writeFileString(path.join(root, name, "Local State"), "official sentinel");
      }
      for (const platform of ["darwin", "win32"] as const) {
        const destination = yield* resolveUserDataPath({
          appDataDirectory: root,
          isDevelopment,
          platform,
        });
        assert.equal(destination, path.join(root, isDevelopment ? "botduetdot-dev" : "botduetdot"));
        assert.isFalse(yield* fs.exists(destination));
      }
      assert.equal(
        resolveDesktopBaseDir({ homeDirectory: root, joinPath: path.join, t3Home: Option.none() }),
        path.join(root, ".botduetdot"),
      );
      assert.equal(
        resolveDesktopBaseDir({
          homeDirectory: root,
          joinPath: path.join,
          t3Home: Option.some(" /explicit/home "),
        }),
        "/explicit/home",
      );
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
);
