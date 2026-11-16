// @effect-diagnostics nodeBuiltinImport:off - Build tools and Metro share repository-relative source filtering.
import * as NodePath from "node:path";
import * as NodeURL from "node:url";
import { resolveBrandProfile, type BrandProfile } from "@t3tools/contracts/brandProfiles";
import type { Plugin } from "vite-plus";

const repoRoot = NodeURL.fileURLToPath(new URL("../../", import.meta.url));

export const BRAND_TEXT_EXCLUSIONS: Readonly<Record<string, string>> = {
  "packages/source-control-github/src/server/GitHubAppSignIn.ts":
    "Documents the official GitHub OAuth app whose client ID enables this integration.",
  "apps/web/src/components/T3AppIcon.tsx": "Documents the official GitHub OAuth app icon.",
  "apps/mobile/src/features/settings/components/SourceControlSignInSection.tsx":
    "Names the official GitHub OAuth app as an example in a doc comment.",
};

export function brandTextSourcePath(id: string, root = repoRoot): string | undefined {
  if (id.includes("\0")) return;
  const path = id.split(/[?#]/, 1)[0]!.replaceAll("\\", "/");
  const base = root.replaceAll("\\", "/").replace(/\/$/, "");
  const relative = NodePath.posix.relative(base, path);
  if (
    /^(?:apps|packages)\/[^/]+\/src\//.test(relative) &&
    !relative.split("/").includes("node_modules") &&
    !/^packages\/contracts\/src\/brand[^/]*\.ts$/.test(relative)
  )
    return relative;
}

export function isBrandTextSource(id: string, root = repoRoot): boolean {
  const relative = brandTextSourcePath(id, root);
  return relative !== undefined && !Object.hasOwn(BRAND_TEXT_EXCLUSIONS, relative);
}

// Subcommands of the CLI whose launcher standalone installs as BRAND.cliName.
const CLI_SUBCOMMANDS =
  "app|auth|browser|config|connect|doctor|down|environment|install|pair|policy|project|serve|service|status|theme|thread|trace|triage|uninstall|up|update";
// "T3 Code" and "T3 home" contain a space, so they are never identifiers. The CLI name changes only
// in quoted `t3`/`t3 <subcommand>` copy and `t3@${version}` labels, never in other template text
// (the git message `t3 checkpoint …`) or npm commands (`npx t3@`, `install t3@`, `${runner} t3@`).
const BRAND_TEXT_PATTERN = new RegExp(
  `T3 Code|T3 home|(?<=\`)t3(?=\`| (?:${CLI_SUBCOMMANDS})\\b)|(?<!\\} |npx |install )\\bt3@(?=\\$\\{)`,
  "g",
);

function replacementFor(match: string, brand: BrandProfile): string {
  if (match === "T3 Code") return brand.name;
  if (match === "T3 home") return `${brand.name} home`;
  return match === "t3@" ? `${brand.cliName}@` : brand.cliName;
}

export function hasBrandText(code: string): boolean {
  return new RegExp(BRAND_TEXT_PATTERN.source).test(code);
}

export function rewriteBrandText(code: string, brand: BrandProfile): string {
  return brand.id === "upstream"
    ? code
    : code.replace(BRAND_TEXT_PATTERN, (match) => replacementFor(match, brand));
}

function blankText(text: string): string {
  return text.replace(/[^\r\n]/g, " ");
}

export function prepareOfficialBrandSource(
  code: string,
  id: string,
  brand: BrandProfile,
  root = repoRoot,
): string {
  const relative = brandTextSourcePath(id, root);
  if (
    brand.id === "upstream" ||
    relative === undefined ||
    !Object.hasOwn(BRAND_TEXT_EXCLUSIONS, relative)
  )
    return code;
  // These comments describe the official product; omit them instead of misattributing them.
  const result = code.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, (comment) =>
    comment.includes("T3 Code") ? blankText(comment) : comment,
  );
  return result;
}

const BASE64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
function vlq(value: number): string {
  let rest = value < 0 ? -value * 2 + 1 : value * 2;
  let result = "";
  do {
    const digit = rest % 32;
    rest = Math.floor(rest / 32);
    result += BASE64[digit + (rest > 0 ? 32 : 0)];
  } while (rest > 0);
  return result;
}

// A column mapping for every UTF-16 code unit keeps positions exact after replacements of any length.
function rewriteWithMap(code: string, id: string, brand: BrandProfile) {
  let previousColumn = 0;
  const mappings = code
    .split("\n")
    .map((line, lineIndex) => {
      const replacements = new Map<number, { length: number; text: string }>();
      for (const match of line.matchAll(BRAND_TEXT_PATTERN))
        replacements.set(match.index, {
          length: match[0].length,
          text: replacementFor(match[0], brand),
        });
      const segments: string[] = [];
      let generatedColumn = 0;
      let lastGeneratedColumn = 0;
      for (let column = 0; column <= line.length; column++) {
        const replaced = replacements.get(column);
        const width = replaced ? replaced.text.length : 1;
        for (let index = 0; index < width; index++) {
          const originalColumn = column + (replaced ? Math.min(index, replaced.length - 1) : 0);
          segments.push(
            `${vlq(generatedColumn - lastGeneratedColumn)}A${lineIndex > 0 && column === 0 && index === 0 ? "C" : "A"}${vlq(originalColumn - previousColumn)}`,
          );
          lastGeneratedColumn = generatedColumn++;
          previousColumn = originalColumn;
        }
        if (replaced) column += replaced.length - 1;
      }
      return segments.join(",");
    })
    .join(";");
  return {
    code: rewriteBrandText(code, brand),
    map: { version: 3, sources: [id], sourcesContent: [code], names: [], mappings },
  };
}

export function brandTextPlugin(brand: BrandProfile, root = repoRoot) {
  return {
    name: "t3code:brand-text",
    enforce: "pre",
    transform(this: void, code: string, id: string) {
      if (brand.id === "upstream") return;
      const prepared = prepareOfficialBrandSource(code, id, brand, root);
      // The official-product omissions preserve every column and newline.
      if (prepared !== code) return { code: prepared, map: null };
      if (!isBrandTextSource(id, root) || !hasBrandText(code)) return;
      return rewriteWithMap(code, id, brand);
    },
  } satisfies Plugin;
}

export function brandTextPlugins(env: Readonly<Record<string, string | undefined>>) {
  const brand = resolveBrandProfile(env.T3CODE_BRAND);
  return brand.id === "standalone" ? [brandTextPlugin(brand)] : [];
}
