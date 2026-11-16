import type { BrandProfile } from "@t3tools/contracts/brandProfiles";
import { fromJsonStringPretty } from "@t3tools/shared/schemaJson";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";

const ManifestJson = fromJsonStringPretty(Schema.Record(Schema.String, Schema.Unknown));
const decodeManifest = Schema.decodeEffect(ManifestJson);
const encodeManifest = Schema.encodeEffect(ManifestJson);

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
  const manifest = {
    ...(yield* decodeManifest(source)),
    name: brand.name,
    short_name: brand.name,
  };
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
  yield* fs.writeFileString(manifestPath, `${yield* encodeManifest(manifest)}\n`);
});
