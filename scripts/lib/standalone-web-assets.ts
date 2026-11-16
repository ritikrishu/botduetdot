import type { BrandProfile } from "@t3tools/contracts/brandProfiles";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

export const applyStandaloneWebAssets = Effect.fn("applyStandaloneWebAssets")(function* (
  brand: BrandProfile,
  targetDir: string,
) {
  if (brand.id !== "standalone") return;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const root = yield* path.fromFileUrl(new URL("../../", import.meta.url));
  const target = path.resolve(root, targetDir);
  const manifestPath = path.join(target, "manifest.webmanifest");
  const source = yield* fs.readFileString(manifestPath);
  const manifest = yield* Effect.try(() => {
    const value: unknown = JSON.parse(source);
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      throw new Error("Web manifest must be an object.");
    }
    return { ...value, name: brand.name, short_name: brand.name };
  });
  for (const name of [
    "favicon.ico",
    "favicon-16x16.png",
    "favicon-32x32.png",
    "apple-touch-icon.png",
    "icon-192x192.png",
    "icon-512x512.png",
  ]) {
    yield* fs.copyFile(
      path.join(root, "assets/brand/standalone/web", name),
      path.join(target, name),
    );
  }
  yield* fs.writeFileString(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
});
