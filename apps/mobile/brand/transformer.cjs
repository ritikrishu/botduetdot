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
        // Babel splits templates at each expression; restore the `}` / `${` around every piece so
        // rules that look at neighbours (`t3@${version}` labels, `${runner} t3@` commands) match
        // exactly as the source-text rewrite does for the other bundles.
        TemplateLiteral({ node }) {
          node.quasis.forEach((quasi, index) => {
            const before = index > 0 ? "}" : "";
            const after = quasi.tail ? "" : "${";
            const apply = (text) => {
              const out = rewrite(`${before}${text}${after}`);
              return out.slice(before.length, out.length - after.length);
            };
            quasi.value.raw = apply(quasi.value.raw);
            if (quasi.value.cooked !== null) quasi.value.cooked = apply(quasi.value.cooked);
          });
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
