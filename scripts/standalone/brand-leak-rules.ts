export const RELEASE_IDENTITY = {
  name: "BotDuetDot",
  slug: "botduetdot",
  appId: "com.ritikrishu.botduetdot",
  repository: "ritikrishu/botduetdot",
  homepage: "https://ritikrishu.github.io/botduetdot/",
} as const;

export function validateVersion(value: string): string {
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)-botduetdot\.(0|[1-9]\d*)$/.test(value)) {
    throw new Error("Version must be X.Y.Z-botduetdot.N with no leading zeroes.");
  }
  if (value.split(/\D+/).some((part) => part && !Number.isSafeInteger(Number(part)))) {
    throw new Error("Version components must be safe integers.");
  }
  return value;
}

export function validateVersionCode(value: string, previous?: string): number {
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(4, 6));
  const day = Number(value.slice(6, 8));
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1] ?? 0;
  if (
    !/^\d{10}$/.test(value) ||
    Number(value) > 2_100_000_000 ||
    year < 1 ||
    day < 1 ||
    day > days
  ) {
    throw new Error("versionCode must be YYYYMMDDNN, a valid date, and at most 2100000000.");
  }
  if (previous !== undefined && (!/^\d+$/.test(previous) || Number(value) <= Number(previous))) {
    throw new Error("versionCode must exceed the highest code already used on any Play track.");
  }
  return Number(value);
}

export const FORBIDDEN_PATTERNS = [
  ["upstream-name", /T3 Code/g],
  ["t3-domain", /t3\.codes/gi],
  ["upstream-owner", /pingdotgg/gi],
  ["upstream-identifier", /com[./]t3tools/gi],
  ["upstream-npm", /registry\.npmjs\.org\/t3/gi],
  // The standalone CLI has no npm package; npx t3@… runs the upstream CLI.
  ["upstream-npx", /npx t3@/g],
  ["upstream-home-label", /T3 home/g],
  ["expo-update", /u\.expo\.dev/gi],
  ["expo-project", /d763fcb8-d37c-41ea-a773-b54a0ab4a454/gi],
  ["posthog-key", /phc_/g],
  // A publishable key is the prefix plus base64 of its frontend API host. Bare prefixes are the
  // dormant key parsers in @clerk/shared and relayAuth, which T3 Connect being off never reaches.
  ["clerk-key", /pk_(?:live|test)_[A-Za-z0-9+/]{10,}/g],
  ["upstream-profile", /t3code-v2|T3 Code \(Alpha\)|["'`]t3code-dev["'`]/g],
  [
    "upstream-scheme",
    /t3code(?:-dev|-preview)?:\/\/|["'`]t3code(?:-dev|-preview)?:["'`]|t3code\(\?:-/g,
  ],
  ["upstream-home", /["'`]\.t3["'`]|\/\.t3(?:\/|["'`\s]|$)|\$HOME\/\.t3\b/g],
] as const;

export interface CountedExemption {
  readonly scope: RegExp;
  readonly literal: string;
  readonly count: number;
  readonly reason: string;
  readonly source: string;
  /** Exemptions apply only to JavaScript unless they opt in to one non-JavaScript text file. */
  readonly text?: true;
}

/**
 * V8 bytecode caches built by scripts/prepare-server-compile-cache.cjs from the packaged server
 * JavaScript. Their strings come from files the scan already counts, so they may hold permitted
 * literals at any count; every other pattern still fails. File names are content hashes.
 */
export const DERIVED_CACHE_SCOPE = /(?:^|\/)server-compile-cache\/[^/]+$/;

const server = (name: string) => new RegExp(`(?:^|/)apps/server/dist/${name}-[^/]+\\.mjs$`);
const main = /(?:^|\/)apps\/desktop\/dist-electron\/main\.cjs$/;
const webUtils = /(?:^|\/)apps\/server\/dist\/client\/assets\/utils-[^/]+\.js$/;
const schemaScopes = [
  server("ManagedEndpointRuntime"),
  main,
  /apps\/desktop\/dist-electron\/snapShot-[^/]+\.cjs$/,
  webUtils,
];

// Counts are from the arm64 0.1.9-botduetdot.1 build; scopes ignore only content hashes.
export const ABOUT_CREDITS = "Based on T3 Code © 2026 T3 Tools Inc. (MIT License)";
export const ANDROID_JS_SCOPE = "apps/mobile/index.android.js";
const androidJs = /^apps\/mobile\/index\.android\.js$/;
const hermes = /^base\/assets\/index\.android\.bundle$/;
const utf16 = (literal: string) => `${literal.split("").join("\0")}\0`;
const mobileSchemaLiterals = [
  {
    literal: "https://t3.codes/schema/t3.json",
    source: "packages/contracts/src/t3ProjectFile.ts:10",
  },
  {
    literal: "See https://t3.codes for documentation.",
    source: "packages/contracts/src/t3ProjectFile.ts:115",
  },
];

// Hermes keeps the credit and preview script in UTF-16LE; the other literals are ASCII (r10).
export const HERMES_COUNTED_EXEMPTIONS: readonly CountedExemption[] = [
  {
    scope: hermes,
    literal: utf16(ABOUT_CREDITS),
    // The runtime profile and the preview WebView script, which reads BRAND for the CLI name.
    count: 2,
    reason:
      "MIT attribution in the runtime profile and the preview WebView script (FORK.md decision r11)",
    source: "packages/contracts/src/brandStandalone.ts:66",
    text: true,
  },
  {
    scope: hermes,
    literal: "T3 Code",
    count: 1,
    reason:
      "The MIT notice names the upstream work; any extra ASCII name fails (FORK.md decision r10)",
    source: "third-party-licenses.config.json:4",
    text: true,
  },
  {
    scope: hermes,
    literal: "https://github.com/pingdotgg/t3code",
    count: 1,
    reason: "MIT notice credits its upstream source (FORK.md decision r10)",
    source: "third-party-licenses.config.json:7",
    text: true,
  },
  ...mobileSchemaLiterals.flatMap(({ literal, source }) =>
    [false, true].map((preview) => ({
      scope: hermes,
      literal: preview ? utf16(literal) : literal,
      count: 1,
      reason: `Shared t3.json format identifier in ${preview ? "UTF-16LE preview script" : "ASCII main bundle"} (FORK.md decision r10)`,
      source,
      text: true as const,
    })),
  ),
];

export const ANDROID_JS_COUNTED_EXEMPTIONS: readonly CountedExemption[] = [
  {
    scope: androidJs,
    literal: ABOUT_CREDITS.replace("©", String.raw`\xa9`),
    // The runtime profile and the preview WebView script, which reads BRAND for the CLI name.
    count: 2,
    reason: "MIT runtime attribution; Metro escapes the copyright character (FORK.md decision r10)",
    source: "packages/contracts/src/brandStandalone.ts:66",
  },
  {
    scope: androidJs,
    literal: 'license:"MIT",name:"T3 Code",noticeText:"MIT License',
    count: 1,
    reason: "The generated MIT notice names the upstream work (FORK.md decision r10)",
    source: "third-party-licenses.config.json:4",
  },
  {
    scope: androidJs,
    literal: 'sourceUrl:"https://github.com/pingdotgg/t3code"',
    count: 1,
    reason: "MIT notice credits its upstream source (FORK.md decision r10)",
    source: "third-party-licenses.config.json:7",
  },
  ...mobileSchemaLiterals.map(({ literal, source }) => ({
    scope: androidJs,
    literal,
    count: 2,
    reason:
      "Shared t3.json format identifier in the main bundle and preview script (FORK.md decision r10)",
    source,
  })),
];

export const COUNTED_EXEMPTIONS: readonly CountedExemption[] = [
  ...[
    server("ManagedEndpointRuntime"),
    main,
    /(?:^|\/)apps\/server\/dist\/client\/assets\/index-[^/]+\.js$/,
  ].map((scope) => ({
    scope,
    literal: ABOUT_CREDITS,
    count: 1,
    reason: "MIT attribution retained verbatim (FORK.md decision r9)",
    source: "packages/contracts/src/brandStandalone.ts:66",
  })),
  {
    scope: /(?:^|\/)apps\/server\/dist\/client\/third-party-licenses\.json$/,
    literal: '"license":"MIT","name":"T3 Code","noticeText":"MIT License',
    count: 1,
    reason: "The generated MIT notice names the upstream work (FORK.md decision r5)",
    source: "third-party-licenses.config.json:4",
    text: true,
  },
  ...["t3code://app", "t3code-dev://app"].map((literal) => ({
    scope: server("relayTracing"),
    literal,
    count: 1,
    reason: "Official renderer CORS interoperability",
    source: "apps/server/src/httpCors.ts:15",
  })),
  ...schemaScopes.flatMap((scope) =>
    ["https://t3.codes/schema/t3.json", "See https://t3.codes for documentation."].map(
      (literal) => ({
        scope,
        literal,
        count: 1,
        reason: "Shared t3.json format identifier",
        source: literal.startsWith("See ")
          ? "packages/contracts/src/t3ProjectFile.ts:115"
          : "packages/contracts/src/t3ProjectFile.ts:10",
      }),
    ),
  ),
  {
    scope: server("server"),
    literal: "Outside MCP clients get app.t3.codes thread links",
    count: 1,
    reason: "Inert diagnostic text",
    source: "apps/server/src/auth/McpOAuth.ts:597",
  },
  {
    scope: server("binCli"),
    literal: "Remote: phones, other computers, app.t3.codes",
    count: 1,
    reason: "Windows ADMX label; Windows is out of scope",
    source: "apps/server/src/policy/policyTemplates.ts:100",
  },
  {
    scope: server("binCli"),
    literal: "installs `document` for `com.t3tools.t3code`",
    count: 1,
    reason: "Inert doc comment; the standalone profile uses the brand app ID",
    source: "apps/server/src/policy/policyTemplates.ts:341",
  },
  {
    scope: server("relayTracing"),
    literal: "app.t3.codes serves stable",
    count: 1,
    reason: "Inert doc comment on a T3 Connect setting that standalone disables",
    source: "apps/server/src/cloud/publicConfig.ts:127",
  },
  {
    scope: main,
    literal: '"snap-shot@t3.codes"',
    count: 1,
    reason: "GNOME Shell extension UUID; Linux capture is out of scope",
    source: "apps/desktop/gnome-extension/bundle.json:2",
  },
  {
    scope: /(?:^|\/)apps\/server\/dist\/client\/third-party-licenses\.json$/,
    literal: '"sourceUrl":"https://github.com/pingdotgg/t3code"',
    count: 1,
    reason: "MIT notice for T3 Code must credit its source (FORK.md decision r5)",
    source: "third-party-licenses.config.json:7",
    text: true,
  },
  {
    scope: server("runtimeLayer"),
    literal: "/.t3/worktrees/",
    count: 1,
    reason: "Recognize official worktrees",
    source: "apps/server/src/project/AgentSessionScanner.ts:703",
  },
  {
    scope: server("binCli"),
    literal: '".t3"',
    count: 1,
    reason: "Isolated linked-worktree development home",
    source: "packages/shared/src/devHome.ts:65",
  },
  {
    scope: main,
    literal: 'runtime_parent=\\"$HOME/.t3/wsl-runtime\\"',
    count: 2,
    reason: "WSL is out of scope",
    source: "apps/desktop/src/wsl/DesktopWslEnvironment.ts:268,357",
  },
  {
    scope: main,
    literal: 'rm -f "$HOME/.t3/wsl-runtime/',
    count: 1,
    reason: "WSL is out of scope",
    source: "apps/desktop/src/wsl/DesktopWslEnvironment.ts:408",
  },
  ...["com.t3tools.SnapShot", "/com/t3tools/SnapShot"].map((literal) => ({
    scope: main,
    literal,
    count: 2,
    reason: "Linux capture is out of scope",
    source: "apps/desktop/src/snapShot/linuxCaptureSession.ts:20",
  })),
  {
    scope: main,
    literal: "com.t3tools.T3Code.KdeCapture.desktop",
    count: 1,
    reason: "Linux capture is out of scope",
    source: "apps/desktop/src/snapShot/KdeSnapShot.ts:18",
  },
  ...["com.t3tools.T3Code.desktop", "com.t3tools.T3Code.Development.desktop"].map((literal) => ({
    scope: main,
    literal,
    count: 1,
    reason: "Linux desktop entry is out of scope",
    source: "apps/desktop/src/app/DesktopEarlyElectronStartup.ts:34",
  })),
];

export const BARE_NAME_COUNTS = [
  // packages/shared/src/{relayTracing.ts:169,t3McpToolPresentation.ts:93}: OTel namespace + MCP alias.
  // apps/mobile/src/features/showcase/showcasePendingTasks.ts:15: fixture project ID.
  // Attribution: packages/client-runtime/src/userMessage.ts:114 and
  // apps/mobile/src/features/threads/{ThreadFeed.tsx:1969,ThreadQueueControl.tsx:93}.
  [androidJs, 6],
  [server("ManagedEndpointRuntime"), 6],
  [server("binCli"), 1],
  [server("binMain"), 1],
  [server("relayTracing"), 1],
  [server("runtimeLayer"), 1],
  [server("server"), 2],
  [main, 6],
  [/apps\/desktop\/dist-electron\/compileCache\.cjs$/, 1],
  ...[
    ["_chat", 1],
    ["main", 1],
    ["useTimelineFollow", 3],
    ["utils", 2],
  ].map(
    ([name, count]) =>
      [new RegExp(`apps/server/dist/client/assets/${name}-[^/]+\\.js$`), count] as const,
  ),
] as readonly (readonly [RegExp, number])[];

// Reviewed merged manifest of the 0.1.9-botduetdot.1 AAB: runtime prompts are camera, microphone
// and notifications; the rest are library install-time permissions. Push and the install referrer
// are blocked in apps/mobile/brand.config.ts; a new permission fails until reviewed.
export const ANDROID_PERMISSIONS = [
  "android.permission.ACCESS_NETWORK_STATE",
  "android.permission.ACCESS_WIFI_STATE",
  "android.permission.CAMERA",
  "android.permission.FOREGROUND_SERVICE",
  "android.permission.INTERNET",
  "android.permission.MODIFY_AUDIO_SETTINGS",
  "android.permission.POST_NOTIFICATIONS",
  "android.permission.POST_PROMOTED_NOTIFICATIONS",
  "android.permission.READ_APP_BADGE",
  "android.permission.RECEIVE_BOOT_COMPLETED",
  "android.permission.RECORD_AUDIO",
  "android.permission.USE_BIOMETRIC",
  "android.permission.USE_FINGERPRINT",
  "android.permission.VIBRATE",
  "android.permission.WAKE_LOCK",
  "com.anddoes.launcher.permission.UPDATE_COUNT",
  "com.htc.launcher.permission.READ_SETTINGS",
  "com.htc.launcher.permission.UPDATE_SHORTCUT",
  "com.huawei.android.launcher.permission.CHANGE_BADGE",
  "com.huawei.android.launcher.permission.READ_SETTINGS",
  "com.huawei.android.launcher.permission.WRITE_SETTINGS",
  "com.majeur.launcher.permission.UPDATE_BADGE",
  "com.oppo.launcher.permission.READ_SETTINGS",
  "com.oppo.launcher.permission.WRITE_SETTINGS",
  "com.ritikrishu.botduetdot.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION",
  "com.sec.android.provider.badge.permission.READ",
  "com.sec.android.provider.badge.permission.WRITE",
  "com.sonyericsson.home.permission.BROADCAST_BADGE",
  "com.sonymobile.home.permission.PROVIDER_INSERT_BADGE",
  "me.everything.badger.permission.BADGE_COUNT_READ",
  "me.everything.badger.permission.BADGE_COUNT_WRITE",
] as const;

export const FORBIDDEN_ENTITLEMENTS = [
  "com.apple.application-identifier",
  "com.apple.developer.team-identifier",
  "com.apple.developer.associated-domains",
  "keychain-access-groups",
] as const;
