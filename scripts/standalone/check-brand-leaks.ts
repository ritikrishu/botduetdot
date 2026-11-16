#!/usr/bin/env node
// @effect-diagnostics nodeBuiltinImport:off - Offline artifact inspection uses Node and platform release tools.
import * as NodeChildProcess from "node:child_process";
import * as NodeCrypto from "node:crypto";
import * as NodeFS from "node:fs";
import * as NodeModule from "node:module";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";
import * as NodeUtil from "node:util";
import { extractAll, listPackage } from "@electron/asar";
import Plist from "plist";
import * as Schema from "effect/Schema";
import { fromYaml } from "@t3tools/shared/schemaYaml";
import {
  ANDROID_PERMISSIONS,
  BARE_NAME_COUNTS,
  COUNTED_EXEMPTIONS,
  DERIVED_CACHE_SCOPE,
  FORBIDDEN_ENTITLEMENTS,
  FORBIDDEN_PATTERNS,
  RELEASE_IDENTITY,
  validateVersion,
  validateVersionCode,
  type CountedExemption,
} from "./brand-leak-rules.ts";

export function print(message: string): void {
  process.stdout.write(`${message}\n`);
}
export function printError(message: string): void {
  process.stderr.write(`${message}\n`);
}

export const REPO_ROOT = NodeURL.fileURLToPath(new URL("../../", import.meta.url));
export interface Finding {
  artifact: string;
  rule: string;
  offset: number;
  context: string;
}
export interface ScanFile {
  artifact: string;
  scope: string;
  text: string;
  javascript: boolean;
}
export type Environment = Readonly<Record<string, string | undefined>>;

export function redact(text: string, env: Environment = process.env): string {
  let result = text.replace(/(?:phc_|pk_(?:live|test)_)[A-Za-z0-9_=-]*/g, "[redacted key]");
  for (const [key, value] of Object.entries(env)) {
    if (value && /PASSWORD|TOKEN|SECRET|PRIVATE_KEY|CSC_LINK/.test(key))
      result = result.replaceAll(value, "[redacted]");
  }
  return result;
}

export function finding(artifact: string, rule: string, text: string, offset = 0): Finding {
  return {
    artifact,
    rule,
    offset,
    context: redact(text.slice(Math.max(0, offset - 30), Math.max(0, offset - 30) + 80)).replace(
      /[\s\p{Cc}]/gu,
      " ",
    ),
  };
}

function decodeEscapes(text: string) {
  const edits: { at: number; extra: number }[] = [];
  let extra = 0;
  const decoded = text.replace(
    /\\(?:x([\da-f]{2})|u([\da-f]{4})|u\{([\da-f]+)\}|([/"'`\\]))/gi,
    (
      whole: string,
      hex: string | undefined,
      unicode: string | undefined,
      point: string | undefined,
      char: string | undefined,
      at: number,
    ) => {
      const value =
        char ??
        String.fromCodePoint(
          Math.min(0x10ffff, Number.parseInt(hex ?? unicode ?? point ?? "0", 16)),
        );
      edits.push({ at: at - extra, extra: whole.length - value.length });
      extra += whole.length - value.length;
      return value;
    },
  );
  return {
    text: decoded,
    originalOffset: (at: number) =>
      at + edits.reduce((sum, edit) => sum + (edit.at < at ? edit.extra : 0), 0),
  };
}

export function scanText(
  file: ScanFile,
  exemptions: readonly CountedExemption[] = COUNTED_EXEMPTIONS,
  countBare = true,
): Finding[] {
  const findings: Finding[] = [];
  let text = file.text;
  for (const exemption of exemptions.filter(
    (item) => item.scope.test(file.scope) && (file.javascript || item.text === true),
  )) {
    const count = text.split(exemption.literal).length - 1;
    if (count !== exemption.count)
      findings.push(
        finding(
          file.artifact,
          `exemption-count: expected ${exemption.count}, found ${count}; ${exemption.source}`,
          text,
          Math.max(0, text.indexOf(exemption.literal)),
        ),
      );
    // A changed exemption never masks the newly introduced occurrences.
    if (count === exemption.count)
      text = text.replaceAll(exemption.literal, " ".repeat(exemption.literal.length));
  }
  const normalized = file.javascript
    ? decodeEscapes(text)
    : { text, originalOffset: (at: number) => at };
  const addMatches = (rule: string, pattern: RegExp) => {
    for (const match of normalized.text.matchAll(new RegExp(pattern.source, pattern.flags))) {
      const offset = normalized.originalOffset(match.index);
      findings.push(finding(file.artifact, rule, file.text, offset));
    }
  };
  for (const [rule, pattern] of FORBIDDEN_PATTERNS) addMatches(rule, pattern);
  if (file.javascript) {
    for (const expression of normalized.text.matchAll(
      /(?:["'`][^"'`\n]*["'`]\s*\+\s*)+["'`][^"'`\n]*["'`]/g,
    )) {
      const joined = [...expression[0].matchAll(/["'`]([^"'`]*)["'`]/g)]
        .map((part) => part[1])
        .join("");
      const literal = `"${joined}"`;
      if (
        joined === "t3code" ||
        FORBIDDEN_PATTERNS.some(([, pattern]) =>
          new RegExp(pattern.source, pattern.flags).test(literal),
        )
      ) {
        findings.push(
          finding(
            file.artifact,
            "concatenated-upstream-identity",
            file.text,
            normalized.originalOffset(expression.index),
          ),
        );
      }
    }
    const bare = [...normalized.text.matchAll(/["'`]t3code["'`]/g)];
    const expected = BARE_NAME_COUNTS.find(([scope]) => scope.test(file.scope))?.[1] ?? 0;
    if (countBare && bare.length !== expected)
      findings.push(
        finding(
          file.artifact,
          `bare-name-count: expected ${expected}, found ${bare.length}`,
          file.text,
          normalized.originalOffset(bare[0]?.index ?? 0),
        ),
      );
    addMatches(
      "scheme-constant",
      /\b\w*(?:scheme|protocol)\w*\s*[:=]\s*["'`]t3code(?:-dev|-preview)?["'`]/gi,
    );
    for (const match of normalized.text.matchAll(
      /\b([\w$]+)\s*=\s*["']t3code(?:-dev|-preview)?["']/g,
    )) {
      const identifier = match[1]!.replace(/[$]/g, "\\$");
      if (
        new RegExp(`\\$\\{${identifier}\\}:|\\b${identifier}\\s*\\+\\s*["']:`).test(normalized.text)
      ) {
        findings.push(
          finding(
            file.artifact,
            "constructed-upstream-scheme",
            file.text,
            normalized.originalOffset(match.index),
          ),
        );
      }
    }
  } else if (/index\.android\.bundle$/.test(file.scope)) {
    addMatches(
      "hermes-upstream-identity",
      /(?:^|[^\w-])(?:t3code(?:-dev|-preview)?|\.t3)(?=[^\w:-]|$)/g,
    );
  }
  return findings;
}

export function scanCollection(
  files: readonly ScanFile[],
  exemptions: readonly CountedExemption[] = COUNTED_EXEMPTIONS,
  bareCounts: readonly (readonly [RegExp, number])[] = BARE_NAME_COUNTS,
): Finding[] {
  const findings: Finding[] = [];
  const permitted: CountedExemption[] = [];
  for (const exemption of exemptions) {
    const matching = files.filter(
      (file) => (file.javascript || exemption.text === true) && exemption.scope.test(file.scope),
    );
    const count = matching.reduce(
      (sum, file) => sum + file.text.split(exemption.literal).length - 1,
      0,
    );
    if (count !== exemption.count)
      findings.push(
        finding(
          matching[0]?.artifact ?? files[0]?.artifact ?? "missing bundle",
          `exemption-count: expected ${exemption.count}, found ${count}; ${exemption.source}`,
          exemption.literal,
        ),
      );
    else permitted.push(exemption);
  }
  for (const [scope, expected] of bareCounts) {
    const matching = files.filter((file) => file.javascript && scope.test(file.scope));
    const count = matching.reduce(
      (sum, file) => sum + [...decodeEscapes(file.text).text.matchAll(/["'`]t3code["'`]/g)].length,
      0,
    );
    if (count !== expected)
      findings.push(
        finding(
          matching[0]?.artifact ?? files[0]?.artifact ?? "missing bundle",
          `bare-name-count: expected ${expected}, found ${count}; scope ${scope.source}`,
          "t3code",
        ),
      );
  }
  for (const file of files) {
    const derived = DERIVED_CACHE_SCOPE.test(file.scope);
    const local = permitted
      .filter((item) => derived || item.scope.test(file.scope))
      .map((item) => ({
        ...item,
        ...(derived ? { scope: DERIVED_CACHE_SCOPE, text: true as const } : {}),
        count: file.text.split(item.literal).length - 1,
      }));
    findings.push(...scanText(file, local, !bareCounts.some(([scope]) => scope.test(file.scope))));
  }
  return findings;
}

export function record(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw new Error("Expected a mapping.");
  return value as Record<string, unknown>;
}
export function parseYaml(text: string): Record<string, unknown> {
  return record(Schema.decodeSync(fromYaml(Schema.Unknown))(text));
}
function sameSet(actual: unknown[], expected: readonly unknown[]): boolean {
  return (
    actual.length === expected.length &&
    new Set(actual).size === actual.length &&
    expected.every((item) => actual.includes(item))
  );
}
function assertions(artifact: string, checks: readonly (readonly [boolean, string])[]): Finding[] {
  return checks
    .filter(([ok]) => !ok)
    .map(([, rule]) => finding(artifact, `structure: ${rule}`, rule));
}

export function checkMacPlist(text: string, artifact: string, version?: string): Finding[] {
  const info = record(Plist.parse(text));
  const types = Array.isArray(info.CFBundleURLTypes) ? info.CFBundleURLTypes : [];
  const schemes = types.flatMap((type) => {
    const value = record(type).CFBundleURLSchemes;
    return Array.isArray(value) ? value : [];
  });
  return assertions(artifact, [
    [
      info.CFBundleIdentifier === RELEASE_IDENTITY.appId,
      "CFBundleIdentifier must be com.ritikrishu.botduetdot",
    ],
    [info.CFBundleName === RELEASE_IDENTITY.name, "CFBundleName must be BotDuetDot"],
    [
      sameSet(schemes, ["botduetdot", "botduetdot-dev", "http", "https"]),
      "CFBundleURLSchemes must be exactly botduetdot, botduetdot-dev, http, https",
    ],
    [
      version === undefined || info.CFBundleShortVersionString === version,
      "CFBundleShortVersionString must equal release version",
    ],
    ...Object.entries(info)
      .filter(([key]) => /^NS.*UsageDescription$/.test(key))
      .map(
        ([key, value]) =>
          [
            typeof value === "string" && value.includes(RELEASE_IDENTITY.name),
            `${key} must name BotDuetDot`,
          ] as const,
      ),
  ]);
}
export function checkEntitlements(text: string, artifact: string): Finding[] {
  const info = record(Plist.parse(text));
  return assertions(
    artifact,
    FORBIDDEN_ENTITLEMENTS.map((key) => [!(key in info), `forbidden entitlement ${key}`]),
  );
}
export function checkPackage(text: string, artifact: string, version?: string): Finding[] {
  const info = record(JSON.parse(text));
  return assertions(artifact, [
    [info.name === RELEASE_IDENTITY.slug, "package name must be botduetdot"],
    [info.productName === RELEASE_IDENTITY.name, "package productName must be BotDuetDot"],
    [info.homepage === RELEASE_IDENTITY.homepage, "package homepage must be the owner's site"],
    [!("t3codeWebAuthn" in info), "package must not have t3codeWebAuthn"],
    [
      version === undefined || info.version === version,
      "package version must equal release version",
    ],
  ]);
}
export function checkUpdateConfig(text: string, artifact: string): Finding[] {
  const config = parseYaml(text);
  return assertions(artifact, [
    [
      config.provider === "github" && config.owner === "ritikrishu" && config.repo === "botduetdot",
      "update feed must be github:ritikrishu/botduetdot",
    ],
    [config.channel === "latest", "update channel must be latest"],
  ]);
}
export function checkProfiles(files: readonly ScanFile[]): Finding[] {
  return ["server", "desktop"].flatMap((scope) => {
    const matching = files.filter(
      (file) =>
        file.javascript &&
        (scope === "desktop"
          ? /apps\/desktop\/dist-electron\/main\.cjs$/.test(file.scope)
          : /apps\/server\/dist\/[^/]+\.mjs$/.test(file.scope)),
    );
    const text = matching.map((file) => file.text).join("\n");
    return assertions(matching[0]?.artifact ?? scope, [
      [
        /"?userDataDirName"?\s*:\s*"botduetdot"/.test(text),
        `${scope} inlined userDataDirName must be botduetdot`,
      ],
      [
        /"?homeDirName"?\s*:\s*"\.botduetdot"/.test(text),
        `${scope} inlined homeDirName must be .botduetdot`,
      ],
    ]);
  });
}

interface XmlElement {
  readonly tagName: string;
  getAttribute(name: string): string | null;
  hasAttribute(name: string): boolean;
  getAttributeNS(namespace: string, name: string): string | null;
  hasAttributeNS(namespace: string, name: string): boolean;
  getElementsByTagName(name: string): ArrayLike<XmlElement>;
}
// Reuse plist's XML parser so malformed XML and namespace aliases cannot bypass checks.
const { DOMParser } = NodeModule.createRequire(import.meta.resolve("plist"))("@xmldom/xmldom") as {
  DOMParser: new (options: { onError: (level: string, message: string) => void }) => {
    parseFromString(text: string, type: string): { documentElement: XmlElement };
  };
};
const ANDROID_NS = "http://schemas.android.com/apk/res/android";
export function checkAndroidManifest(
  text: string,
  artifact: string,
  version: string,
  versionCode: number,
): Finding[] {
  const root = new DOMParser({
    onError: (_level, message) => {
      throw new Error(`Malformed Android manifest: ${message}`);
    },
  }).parseFromString(text, "text/xml").documentElement;
  const elements = (tag: string) => Array.from(root.getElementsByTagName(tag));
  const attr = (element: XmlElement, name: string) => element.getAttributeNS(ANDROID_NS, name);
  const data = elements("intent-filter").flatMap((entry) =>
    Array.from(entry.getElementsByTagName("data")),
  );
  const permissions = elements("uses-permission").map((entry) => attr(entry, "name"));
  const metadata = elements("meta-data");
  return assertions(artifact, [
    [
      root.tagName === "manifest" && root.getAttribute("package") === RELEASE_IDENTITY.appId,
      "Android package must be com.ritikrishu.botduetdot",
    ],
    [
      attr(root, "versionName") === version && attr(root, "versionCode") === String(versionCode),
      "Android versionName/versionCode must match requested release",
    ],
    [
      data.some((entry) => attr(entry, "scheme") === "botduetdot"),
      "Android must register botduetdot",
    ],
    ...data.map(
      (entry) =>
        [
          !entry.hasAttributeNS(ANDROID_NS, "scheme") ||
            ["botduetdot", "exp+botduetdot", "clerk"].includes(attr(entry, "scheme") ?? ""),
          `unexpected Android scheme ${attr(entry, "scheme")}`,
        ] as const,
    ),
    [
      data.every((entry) => !/(^|\.)t3\.codes\.?$/i.test(attr(entry, "host") ?? "")),
      "Android host must not end in t3.codes",
    ],
    [
      elements("intent-filter").every((entry) => !entry.hasAttributeNS(ANDROID_NS, "autoVerify")),
      "Android must not declare autoVerify",
    ],
    [
      elements("provider").every((entry) =>
        (attr(entry, "authorities") ?? "")
          .split(";")
          .every(
            (value) =>
              value.startsWith(`${RELEASE_IDENTITY.appId}.`) || value === RELEASE_IDENTITY.appId,
          ),
      ),
      "Android provider authorities must belong to BotDuetDot",
    ],
    [
      elements("permission").every((entry) =>
        (attr(entry, "name") ?? "").startsWith(`${RELEASE_IDENTITY.appId}.`),
      ),
      "Android custom permission names must belong to BotDuetDot",
    ],
    [
      sameSet(permissions, ANDROID_PERMISSIONS),
      `Android permissions must equal reviewed set: ${ANDROID_PERMISSIONS.join(", ")}`,
    ],
    [elements("uses-permission-sdk-23").length === 0, "Unreviewed conditional Android permissions"],
    [
      metadata.filter((entry) => attr(entry, "name") === "expo.modules.updates.ENABLED").length ===
        1 &&
        metadata.some(
          (entry) =>
            attr(entry, "name") === "expo.modules.updates.ENABLED" &&
            attr(entry, "value") === "false",
        ),
      "Expo updates must be disabled",
    ],
    [
      metadata.every((entry) => !/EXPO_UPDATE_URL/.test(attr(entry, "name") ?? "")),
      "Expo update URL must be absent",
    ],
  ]);
}
export function checkExpoConfig(text: string, artifact: string): Finding[] {
  const config = record(JSON.parse(text));
  return assertions(artifact, [
    [!("owner" in config), "Expo owner must be absent"],
    [!("eas" in record(config.extra ?? {})), "Expo extra.eas must be absent"],
    [!("url" in record(config.updates ?? {})), "Expo updates.url must be absent"],
    [
      config.name === RELEASE_IDENTITY.name && config.slug === RELEASE_IDENTITY.slug,
      "Expo name/slug must be BotDuetDot/botduetdot",
    ],
  ]);
}

export function checkAndroidAppName(text: string, artifact: string): Finding[] {
  const values = [...text.matchAll(/ - \[([A-Z_]+)\] (.*)$/gm)];
  return assertions(artifact, [
    [
      values.length > 0 &&
        values.every(
          (match) => (match[1] === "STR" || match[1] === "RAW_STR") && match[2] === '"BotDuetDot"',
        ),
      "all app_name resource values must be BotDuetDot",
    ],
  ]);
}

export interface CommandResult {
  status: number;
  stdout: string;
  stderr: string;
}
export function command(
  commandName: string,
  args: readonly string[],
  options: { cwd?: string; env?: NodeJS.ProcessEnv; input?: string } = {},
): CommandResult {
  const result = NodeChildProcess.spawnSync(commandName, [...args], {
    encoding: "utf8",
    cwd: options.cwd ?? REPO_ROOT,
    env: options.env ?? process.env,
    input: options.input,
    maxBuffer: 256 * 1024 * 1024,
  });
  return {
    status: result.status ?? -1,
    stdout: result.stdout ?? "",
    stderr: result.error ? "Tool unavailable" : (result.stderr ?? ""),
  };
}
export function run(
  commandName: string,
  args: readonly string[],
  options: { cwd?: string; env?: NodeJS.ProcessEnv; input?: string } = {},
): string {
  const result = command(commandName, args, options);
  if (result.status !== 0)
    throw new Error(
      `${commandName} failed (exit ${result.status}); output withheld to protect credentials.`,
    );
  return result.stdout;
}
export function sha256(file: string): string {
  return NodeCrypto.createHash("sha256").update(NodeFS.readFileSync(file)).digest("hex");
}
export function requireCleanTree(): string {
  if (run("git", ["status", "--porcelain"]).trim())
    throw new Error("Release requires a clean git tree (including untracked files).");
  return run("git", ["rev-parse", "HEAD"]).trim();
}
export function assertNoFindings(findings: readonly Finding[]): void {
  if (findings.length)
    throw new Error(
      `Release blocked by ${findings.length} brand/identity findings:\n${formatFindings(findings)}`,
    );
}
export function gateArtifacts<T>(
  files: readonly string[],
  inspect: () => readonly Finding[],
  emit: () => T,
): T {
  const before = files.map(sha256);
  assertNoFindings(inspect());
  if (files.some((file, index) => sha256(file) !== before[index]))
    throw new Error("Artifact changed during verification; refusing output.");
  return emit();
}
export function formatFindings(findings: readonly Finding[]): string {
  return findings
    .map((item) => `${item.artifact}:${item.offset} [${item.rule}] ${item.context}`)
    .join("\n");
}
export function walkFiles(root: string, boundary = root): string[] {
  return NodeFS.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const file = NodePath.join(root, entry.name);
    if (entry.isSymbolicLink()) {
      const target = NodeFS.realpathSync(file);
      if (!target.startsWith(`${NodeFS.realpathSync(boundary)}${NodePath.sep}`))
        throw new Error(`External artifact symlink: ${file}`);
      return [];
    }
    return entry.isDirectory() ? walkFiles(file, boundary) : [file];
  });
}
function scanFiles(root: string, label: string, scopePrefix = "", skipMaps = false): ScanFile[] {
  return walkFiles(root)
    .filter(
      (file) =>
        !/\.(?:node|dylib|so)(?:\.|$)|\.framework\//.test(file) &&
        !file.endsWith("app.asar") &&
        !(skipMaps && file.endsWith(".map")),
    )
    .map((file) => {
      const relative = NodePath.relative(root, file);
      const javascript = /\.(?:js|cjs|mjs)$/.test(file);
      return {
        artifact: `${label}/${relative}`,
        scope: `${scopePrefix}${relative}`,
        text: NodeFS.readFileSync(file).toString(javascript ? "utf8" : "latin1"),
        javascript,
      };
    });
}

function safeArchiveEntries(entries: readonly string[]): void {
  if (
    entries.some(
      (entry) => entry.replace(/^\//, "").split(/[\\/]/).includes("..") || /^[A-Za-z]:/.test(entry),
    )
  )
    throw new Error("Unsafe archive path.");
}
export function withMacApps<T>(
  directory: string,
  version: string,
  use: (apps: readonly { app: string; artifact: string }[]) => T,
): T {
  const temporary = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "botduetdot-inspect-"));
  const mount = NodePath.join(temporary, "dmg");
  const zip = NodePath.join(temporary, "zip");
  const base = `BotDuetDot-${validateVersion(version)}-arm64`;
  const dmgPath = NodePath.join(directory, `${base}.dmg`);
  const zipPath = NodePath.join(directory, `${base}.zip`);
  let mounted = false;
  try {
    NodeFS.mkdirSync(mount);
    NodeFS.mkdirSync(zip);
    run("hdiutil", ["attach", "-nobrowse", "-readonly", "-mountpoint", mount, dmgPath]);
    mounted = true;
    const entries = run("unzip", ["-Z1", zipPath]).trim().split("\n");
    safeArchiveEntries(entries);
    if (entries.some((entry) => entry.startsWith("/"))) throw new Error("Absolute ZIP path.");
    run("ditto", ["-x", "-k", zipPath, zip]);
    return use(
      [
        { root: mount, artifact: dmgPath },
        { root: zip, artifact: zipPath },
      ].map(({ root, artifact }) => {
        const apps = NodeFS.readdirSync(root).filter((entry) => entry.endsWith(".app"));
        if (!sameSet(apps, ["BotDuetDot.app"]))
          throw new Error(`Expected exactly BotDuetDot.app in ${artifact}`);
        return { app: NodePath.join(root, apps[0]!), artifact: `${artifact}!/BotDuetDot.app` };
      }),
    );
  } finally {
    // Never remove a directory containing a still-mounted volume.
    if (mounted) run("hdiutil", ["detach", mount]);
    NodeFS.rmSync(temporary, { recursive: true, force: true });
  }
}

export function checkMacApp(app: string, artifact: string, version: string): Finding[] {
  const temporary = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "botduetdot-asar-"));
  try {
    const resources = NodePath.join(app, "Contents/Resources");
    const asar = NodePath.join(resources, "app.asar");
    safeArchiveEntries(listPackage(asar, { isPack: false }));
    extractAll(asar, temporary);
    const files = [
      ...scanFiles(resources, `${artifact}/Contents/Resources`).filter(
        (file) => file.scope !== "app.asar",
      ),
      ...scanFiles(temporary, `${artifact}/Contents/Resources/app.asar!`),
    ];
    const infoPath = NodePath.join(app, "Contents/Info.plist");
    const info = run("plutil", ["-convert", "xml1", "-o", "-", infoPath]);
    const entitlements = command("codesign", ["-d", "--entitlements", ":-", app]);
    const findings = scanCollection(files);
    findings.push(
      ...scanText({
        artifact: `${artifact}/Contents/Info.plist`,
        scope: "Info.plist",
        text: info,
        javascript: false,
      }),
      ...checkMacPlist(info, `${artifact}/Contents/Info.plist`, version),
    );
    if (entitlements.status !== 0)
      findings.push(
        finding(artifact, "entitlements-unavailable", "codesign could not read entitlements"),
      );
    else if (entitlements.stdout.trim()) {
      findings.push(
        ...scanText({
          artifact: `${artifact}/entitlements`,
          scope: "entitlements",
          text: entitlements.stdout,
          javascript: false,
        }),
        ...checkEntitlements(entitlements.stdout, `${artifact}/entitlements`),
      );
    }
    findings.push(
      ...checkPackage(
        NodeFS.readFileSync(NodePath.join(temporary, "package.json"), "utf8"),
        `${artifact}/Contents/Resources/app.asar!/package.json`,
        version,
      ),
    );
    findings.push(
      ...checkUpdateConfig(
        NodeFS.readFileSync(NodePath.join(resources, "app-update.yml"), "utf8"),
        `${artifact}/Contents/Resources/app-update.yml`,
      ),
    );
    findings.push(...checkProfiles(files));
    return findings;
  } finally {
    NodeFS.rmSync(temporary, { recursive: true, force: true });
  }
}

export function checkUpdateManifest(directory: string, version: string): Finding[] {
  const file = NodePath.join(directory, "latest-mac.yml");
  const text = NodeFS.readFileSync(file, "utf8");
  const manifest = parseYaml(text);
  const base = `BotDuetDot-${version}-arm64`;
  const files = Array.isArray(manifest.files) ? manifest.files.map(record) : [];
  const findings = scanText({ artifact: file, scope: "latest-mac.yml", text, javascript: false });
  findings.push(
    ...assertions(file, [
      [
        manifest.version === version && manifest.path === `${base}.zip`,
        "latest-mac.yml version/path must name the release ZIP",
      ],
      [
        sameSet(
          files.map((entry) => entry.url),
          [`${base}.zip`, `${base}.dmg`],
        ),
        "latest-mac.yml must list only this release's DMG and ZIP",
      ],
    ]),
  );
  for (const entry of files) {
    if (typeof entry.url !== "string" || ![`${base}.zip`, `${base}.dmg`].includes(entry.url))
      continue;
    const bytes = NodeFS.readFileSync(NodePath.join(directory, entry.url));
    const hash = NodeCrypto.createHash("sha512").update(bytes).digest("base64");
    findings.push(
      ...assertions(file, [
        [
          entry.sha512 === hash && entry.size === bytes.length,
          `size/sha512 mismatch for ${entry.url}`,
        ],
      ]),
    );
    if (entry.url.endsWith(".zip"))
      findings.push(
        ...assertions(file, [[manifest.sha512 === hash, "top-level ZIP sha512 mismatch"]]),
      );
  }
  return findings;
}
export function checkMacRelease(directory: string, expectedVersion?: string): Finding[] {
  const version = validateVersion(
    expectedVersion ??
      String(
        parseYaml(NodeFS.readFileSync(NodePath.join(directory, "latest-mac.yml"), "utf8")).version,
      ),
  );
  return [
    ...checkUpdateManifest(directory, version),
    ...withMacApps(directory, version, (apps) =>
      apps.flatMap(({ app, artifact }) => checkMacApp(app, artifact, version)),
    ),
  ];
}

export function checkAndroidAab(
  aab: string,
  version: string,
  versionCode: number,
  env: NodeJS.ProcessEnv = process.env,
): Finding[] {
  validateVersion(version);
  validateVersionCode(String(versionCode));
  const temporary = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "botduetdot-aab-"));
  try {
    const entries = run("unzip", ["-Z1", aab]).trim().split("\n");
    safeArchiveEntries(entries);
    if (entries.some((entry) => entry.startsWith("/"))) throw new Error("Absolute AAB path.");
    if (entries.some((entry) => /^(?!base\/)[^/]+\/(?:manifest|assets|root)\//.test(entry)))
      throw new Error("Unreviewed AAB feature module.");
    run("unzip", ["-q", aab, "-d", temporary]);
    const manifest = run("bundletool", ["dump", "manifest", `--bundle=${aab}`, "--module=base"], {
      env,
    });
    const resources = run("bundletool", ["dump", "resources", `--bundle=${aab}`, "--values"], {
      env,
    });
    const appName = run(
      "bundletool",
      ["dump", "resources", `--bundle=${aab}`, "--resource=string/app_name", "--values"],
      { env },
    );
    const files = ["base/assets", "base/root"].flatMap((directory) =>
      NodeFS.existsSync(NodePath.join(temporary, directory))
        ? scanFiles(
            NodePath.join(temporary, directory),
            `${aab}!/${directory}`,
            `${directory}/`,
          ).map((file) => ({ ...file, javascript: false }))
        : [],
    );
    for (const required of ["base/assets/index.android.bundle", "base/assets/app.config"]) {
      if (!files.some((file) => file.scope === required))
        throw new Error(`Missing ${required} in AAB`);
    }
    const findings = files.flatMap((file) => scanText(file));
    findings.push(
      ...scanText({
        artifact: `${aab}!/base/manifest/AndroidManifest.xml`,
        scope: "manifest",
        text: manifest,
        javascript: false,
      }),
      ...checkAndroidManifest(
        manifest,
        `${aab}!/base/manifest/AndroidManifest.xml`,
        version,
        versionCode,
      ),
    );
    findings.push(
      ...scanText({
        artifact: `${aab}!/resources`,
        scope: "resources",
        text: resources,
        javascript: false,
      }),
    );
    findings.push(...checkAndroidAppName(appName, `${aab}!/string/app_name`));
    findings.push(
      ...checkExpoConfig(
        NodeFS.readFileSync(NodePath.join(temporary, "base/assets/app.config"), "utf8"),
        `${aab}!/base/assets/app.config`,
      ),
    );
    return findings;
  } finally {
    NodeFS.rmSync(temporary, { recursive: true, force: true });
  }
}

export function main(args = process.argv.slice(2)): void {
  const { values } = NodeUtil.parseArgs({
    args,
    options: {
      help: { type: "boolean" },
      "mac-release": { type: "string" },
      "android-aab": { type: "string" },
      bundles: { type: "boolean" },
      source: { type: "boolean" },
      version: { type: "string" },
      "version-code": { type: "string" },
    },
  });
  if (values.help) {
    print(
      "Usage: node scripts/standalone/check-brand-leaks.ts --mac-release DIR | --android-aab AAB --version X.Y.Z-botduetdot.N --version-code YYYYMMDDNN | --bundles | --source\nChecks are read-only. Offsets are original-text character offsets (binary: byte offsets). --source is advisory; --bundles excludes source maps, as packaging does. No JS is executed. AAB requires bundletool, unzip and a JDK.",
    );
    return;
  }
  if (
    [values["mac-release"], values["android-aab"], values.bundles, values.source].filter(Boolean)
      .length !== 1
  )
    throw new Error("Choose exactly one artifact mode; see --help.");
  let findings: Finding[];
  if (values["mac-release"])
    findings = checkMacRelease(NodePath.resolve(values["mac-release"]), values.version);
  else if (values["android-aab"])
    findings = checkAndroidAab(
      NodePath.resolve(values["android-aab"]),
      validateVersion(values.version ?? process.env.T3CODE_MOBILE_VERSION ?? ""),
      validateVersionCode(values["version-code"] ?? process.env.T3CODE_ANDROID_VERSION_CODE ?? ""),
    );
  else if (values.bundles) {
    const files = ["apps/server/dist", "apps/desktop/dist-electron"].flatMap((directory) =>
      scanFiles(NodePath.join(REPO_ROOT, directory), directory, `${directory}/`, true),
    );
    const web = scanFiles(
      NodePath.join(REPO_ROOT, "apps/web/dist"),
      "apps/web/dist",
      "apps/server/dist/client/",
      true,
    );
    const webRules = COUNTED_EXEMPTIONS.filter((item) => item.scope.source.includes("client"));
    // Web build duplicates the packaged client; scan it independently so counts never cancel out.
    findings = [
      ...scanCollection(files),
      ...checkProfiles(files),
      ...scanCollection(
        web,
        webRules,
        BARE_NAME_COUNTS.filter(([scope]) => scope.source.includes("client")),
      ),
    ];
  } else {
    const files = run("git", ["ls-files", "-z"])
      .split("\0")
      .filter(
        (file) =>
          /\.(?:ts|tsx|js|mjs|cjs)$/.test(file) &&
          !/brand|standalone|\.test\.|^\.repos\//i.test(file),
      );
    findings = files.flatMap((file) =>
      scanText(
        {
          artifact: file,
          scope: file,
          text: NodeFS.readFileSync(NodePath.join(REPO_ROOT, file), "utf8"),
          javascript: false,
        },
        [],
      ),
    );
  }
  print(
    findings.length
      ? formatFindings(findings)
      : "PASS: no brand leaks or structural identity violations.",
  );
  print(`${findings.length} finding(s)${values.source ? " (advisory source scan)" : ""}`);
  if (findings.length && !values.source) process.exitCode = 1;
}
if (
  process.argv[1] &&
  NodePath.resolve(process.argv[1]) === NodeURL.fileURLToPath(import.meta.url)
) {
  try {
    main();
  } catch (error) {
    printError(redact(error instanceof Error ? error.message : "Artifact inspection failed."));
    process.exitCode = 1;
  }
}
