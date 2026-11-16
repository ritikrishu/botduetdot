const path = require("node:path");

function withMobileBrandResolver(config, brand = process.env.T3CODE_BRAND) {
  if (brand !== "standalone") return config;
  const mobileRoot = path.resolve(__dirname, "..");
  const observeStub = path.join(__dirname, "observe.standalone.ts");
  const replacements = new Map([
    [path.join(mobileRoot, "src/features/observability/observe.ts"), observeStub],
    [
      path.join(mobileRoot, "src/components/brandAssets.ts"),
      path.join(__dirname, "assets.standalone.ts"),
    ],
  ]);
  const resolveRequest = config.resolver.resolveRequest;
  config.resolver.resolveRequest = (context, moduleName, platform) => {
    if (moduleName === "expo-observe" || moduleName.startsWith("expo-observe/")) {
      return { type: "sourceFile", filePath: observeStub };
    }
    const resolved = (resolveRequest ?? context.resolveRequest)(context, moduleName, platform);
    const replacement = resolved.type === "sourceFile" && replacements.get(resolved.filePath);
    return replacement ? { type: "sourceFile", filePath: replacement } : resolved;
  };
  return config;
}

module.exports = { withMobileBrandResolver };
