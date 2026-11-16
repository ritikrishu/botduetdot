import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import { STANDALONE_BRAND, UPSTREAM_BRAND } from "@t3tools/contracts/brandProfiles";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import { applyStandaloneWebAssets } from "./standalone-web-assets.ts";

it.effect("replaces standalone assets and preserves unrelated manifest fields", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const dir = yield* fs.makeTempDirectoryScoped();
    const manifest = {
      name: "old",
      short_name: "old",
      start_url: "/threads",
      icons: [{ src: "/icon-512x512.png" }],
      custom: { preserved: true },
    };
    yield* fs.writeFileString(path.join(dir, "manifest.webmanifest"), JSON.stringify(manifest));
    yield* fs.writeFileString(path.join(dir, "favicon.ico"), "old channel icon");
    yield* applyStandaloneWebAssets(STANDALONE_BRAND, dir);
    assert.deepEqual(JSON.parse(yield* fs.readFileString(path.join(dir, "manifest.webmanifest"))), {
      ...manifest,
      name: STANDALONE_BRAND.name,
      short_name: STANDALONE_BRAND.name,
    });
    const files = yield* fs.readDirectory(dir);
    assert.lengthOf(files, 7);
    const source = yield* path.fromFileUrl(
      new URL("../../assets/brand/standalone/web/", import.meta.url),
    );
    for (const file of files.filter((name) => name !== "manifest.webmanifest")) {
      assert.deepEqual(
        yield* fs.readFile(path.join(dir, file)),
        yield* fs.readFile(path.join(source, file)),
      );
    }
  }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
);

it.effect("leaves upstream files byte-identical even without a manifest", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const dir = yield* fs.makeTempDirectoryScoped();
    yield* fs.writeFileString(path.join(dir, "favicon.ico"), "upstream channel");
    yield* applyStandaloneWebAssets(UPSTREAM_BRAND, dir);
    assert.deepEqual(yield* fs.readDirectory(dir), ["favicon.ico"]);
    assert.equal(yield* fs.readFileString(path.join(dir, "favicon.ico")), "upstream channel");
  }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
);

it.effect("rejects malformed manifests before overwriting icons", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const dir = yield* fs.makeTempDirectoryScoped();
    yield* fs.writeFileString(path.join(dir, "manifest.webmanifest"), "null");
    yield* fs.writeFileString(path.join(dir, "favicon.ico"), "original");
    const result = yield* Effect.exit(applyStandaloneWebAssets(STANDALONE_BRAND, dir));
    assert.equal(result._tag, "Failure");
    assert.equal(yield* fs.readFileString(path.join(dir, "favicon.ico")), "original");
  }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
);
