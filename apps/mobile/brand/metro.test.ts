import * as NodeModule from "node:module";
import * as NodePath from "node:path";
import type { MetroConfig } from "expo/metro-config";
import { expect, it, vi } from "vite-plus/test";

const require = NodeModule.createRequire(import.meta.url);
type Resolver = NonNullable<NonNullable<MetroConfig["resolver"]>["resolveRequest"]>;
type ResolverConfig = {
  resolver: { resolveRequest?: Resolver };
  transformer?: { babelTransformerPath?: string };
};
const { withMobileBrandResolver } = require("./metro.cjs") as {
  withMobileBrandResolver: (config: ResolverConfig, brand?: string) => ResolverConfig;
};
const mobileRoot = NodePath.resolve(import.meta.dirname, "..");

function setup() {
  const resolveRequest = vi.fn<Resolver>((_context, moduleName) => ({
    type: "sourceFile",
    filePath: NodePath.resolve(mobileRoot, moduleName),
  }));
  const context = { resolveRequest } as unknown as Parameters<Resolver>[0];
  return { context, resolveRequest };
}

it("leaves the upstream resolver unchanged", () => {
  const { resolveRequest } = setup();
  const transformer = { babelTransformerPath: "upstream-transformer" };
  const config = { resolver: { resolveRequest }, transformer };
  expect(withMobileBrandResolver(config, "upstream")).toBe(config);
  expect(config.resolver.resolveRequest).toBe(resolveRequest);
  expect(config.transformer).toBe(transformer);
});

it("removes Observe entry points and T3 asset modules from standalone resolution", () => {
  const { context, resolveRequest } = setup();
  const config = withMobileBrandResolver({ resolver: {} }, "standalone");
  expect(config.transformer?.babelTransformerPath).toBe(require.resolve("./transformer.cjs"));
  const resolve = config.resolver!.resolveRequest!;
  for (const moduleName of ["expo-observe", "src/features/observability/observe.ts"]) {
    expect(resolve(context, moduleName, "android")).toEqual({
      type: "sourceFile",
      filePath: NodePath.join(import.meta.dirname, "observe.standalone.ts"),
    });
  }
  expect(resolveRequest).not.toHaveBeenCalledWith(context, "expo-observe", "android");
  expect(resolve(context, "src/components/brandAssets.ts", "android")).toEqual({
    type: "sourceFile",
    filePath: NodePath.join(import.meta.dirname, "assets.standalone.ts"),
  });
  expect(resolve(context, "src/App.tsx", "android")).toEqual({
    type: "sourceFile",
    filePath: NodePath.join(mobileRoot, "src/App.tsx"),
  });
});

it("chains an existing resolver when selecting standalone modules", () => {
  const { context, resolveRequest } = setup();
  const previous = vi.fn<Resolver>(() => ({ type: "empty" }));
  const config = withMobileBrandResolver({ resolver: { resolveRequest: previous } }, "standalone");
  expect(config.resolver!.resolveRequest!(context, "elsewhere", "ios")).toEqual({ type: "empty" });
  expect(previous).toHaveBeenCalledWith(context, "elsewhere", "ios");
  expect(resolveRequest).not.toHaveBeenCalled();
});
