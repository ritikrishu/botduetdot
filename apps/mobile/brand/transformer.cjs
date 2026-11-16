const crypto = require("node:crypto");
const fs = require("node:fs");
const { createRequire } = require("node:module");
const { resolveBrandProfile } = require("../../../packages/contracts/src/brandProfiles.ts");
const {
  isBrandTextSource,
  rewriteBrandText,
  prepareOfficialBrandSource,
} = require("../../../scripts/lib/brand-text.ts");

const expoRequire = createRequire(require.resolve("expo/metro-config"));
const upstream = expoRequire("@expo/metro-config/babel-transformer");

function createBrandTransformer(delegate, brand) {
  const rewrite = (text) => rewriteBrandText(text, brand);
  const rewriteValue = ({ node }) => {
    node.value = rewrite(node.value);
  };
  function brandTextBabelPlugin() {
    return {
      name: "standalone-brand-text",
      visitor: {
        StringLiteral: rewriteValue,
        DirectiveLiteral: rewriteValue,
        JSXText: rewriteValue,
        TemplateElement({ node }) {
          node.value.raw = rewrite(node.value.raw);
          if (node.value.cooked !== null) node.value.cooked = rewrite(node.value.cooked);
        },
        RegExpLiteral({ node }) {
          node.pattern = rewrite(node.pattern);
        },
      },
    };
  }
  return {
    ...delegate,
    transform(args) {
      if (brand.id !== "standalone") return delegate.transform(args);
      const src = prepareOfficialBrandSource(args.src, args.filename, brand);
      if (src !== args.src) return delegate.transform({ ...args, src });
      if (!isBrandTextSource(args.filename)) return delegate.transform(args);
      // Babel edits values while keeping original node locations, so Metro maps stay accurate.
      return delegate.transform({
        ...args,
        plugins: [brandTextBabelPlugin, ...(args.plugins ?? [])],
      });
    },
    getCacheKey(...args) {
      return crypto
        .createHash("sha256")
        .update(delegate.getCacheKey?.(...args) ?? "")
        .update(JSON.stringify(brand))
        .update(fs.readFileSync(__filename))
        .update(fs.readFileSync(require.resolve("../../../scripts/lib/brand-text.ts")))
        .digest("hex");
    },
  };
}

module.exports = {
  ...createBrandTransformer(upstream, resolveBrandProfile(process.env.T3CODE_BRAND)),
  createBrandTransformer,
};
