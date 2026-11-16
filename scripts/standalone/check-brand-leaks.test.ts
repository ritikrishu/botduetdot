// @effect-diagnostics nodeBuiltinImport:off - Fixtures exercise offline release gates.
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeCrypto from "node:crypto";
import { describe, expect, it } from "vite-plus/test";
import {
  checkAndroidManifest,
  checkAndroidAppName,
  checkAndroidJs,
  checkEntitlements,
  checkExpoConfig,
  checkMacPlist,
  checkPackage,
  checkProfiles,
  checkUpdateConfig,
  checkUpdateManifest,
  copyVerified,
  gateArtifacts,
  main,
  redact,
  scanCollection,
  scanText,
  type ScanFile,
} from "./check-brand-leaks.ts";
import {
  ABOUT_CREDITS,
  ANDROID_JS_COUNTED_EXEMPTIONS,
  COUNTED_EXEMPTIONS,
  FORBIDDEN_PATTERNS,
  HERMES_COUNTED_EXEMPTIONS,
  type CountedExemption,
} from "./brand-leak-rules.ts";

const fixture = (name: string) =>
  NodeFS.readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
const js = (text: string, scope = "fixture.js"): ScanFile => ({
  artifact: scope,
  scope,
  text,
  javascript: true,
});
const temporary = () => {
  const directory = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "botduetdot-release-test-"));
  return {
    directory,
    [Symbol.dispose]: () => NodeFS.rmSync(directory, { recursive: true, force: true }),
  };
};

describe("artifact leak rules", () => {
  it.each([
    "t3.codes",
    "https://nightly.app.t3.codes",
    "registry.npmjs.org/t3",
    '".t3"',
    "${HOME}/.t3/state",
    "$HOME/.t3",
    "t3code-v2",
    "T3 Code",
    "T3 Code (Dev)",
    "T3 Code (Nightly)",
    "T3 Code (Alpha)",
    String.raw`"T3\u0020Code"`,
    '"T3 " + "Code"',
    "t3code://pair",
    '"t3code:"',
    '"t3code-dev"',
    "t3code(?:-",
    "u.expo.dev",
    "d763fcb8-d37c-41ea-a773-b54a0ab4a454",
    "com.t3tools.t3code",
    "pingdotgg",
    "phc_fake",
    "pk_live_Y2xlcmsuZXhhbXBsZS5jb20k",
    "pk_test_Y2xlcmsuZXhhbXBsZS5jb20k",
    'const scheme="t3code"; const url=`${scheme}://pair`;',
    'const s="t3code"; const url=`${s}://pair`;',
    'const s="t3code"; const url=s+"://pair";',
    String.raw`const host="t3\x2ecodes"`,
    String.raw`const host="t3\u002ecodes"`,
    String.raw`"t3code:\/\/pair"`,
    'const host = "t3" + "." + "codes";',
    'const scheme = "t3" + "code"; const url = `${scheme}://pair`;',
  ])("rejects %s", (text) => {
    expect(scanText(js(text), []).length).toBeGreaterThan(0);
  });
  it("keeps internal namespaces and preview partitions", () => {
    expect(
      scanText(
        js('"t3code:theme"; "t3code-preview-session"; "--t3code-preview-passkey-bridge"'),
        [],
      ),
    ).toEqual([]);
  });
  it("requires exact literal, scope and count in both directions", () => {
    const exemption: CountedExemption = {
      scope: /^fixture\.js$/,
      literal: "https://t3.codes/schema/t3.json",
      count: 1,
      reason: "schema interoperability",
      source: "fixture:1",
    };
    expect(scanText(js(exemption.literal), [exemption])).toEqual([]);
    expect(
      scanText(js("removed"), [exemption]).some((item) => item.rule.startsWith("exemption-count")),
    ).toBe(true);
    expect(
      scanText(js(`${exemption.literal} ${exemption.literal}`), [exemption]).some(
        (item) => item.rule === "t3-domain",
      ),
    ).toBe(true);
    expect(
      scanText(js(exemption.literal, "other.js"), [exemption]).some(
        (item) => item.rule === "t3-domain",
      ),
    ).toBe(true);
    expect(
      scanText({ ...js(exemption.literal), javascript: false }, [exemption]).some(
        (item) => item.rule === "t3-domain",
      ),
    ).toBe(true);
  });
  it("allows the bare Clerk prefixes of dormant key parsers", () => {
    expect(
      scanText(js('k.startsWith("pk_test_")?"pk_test":k.startsWith("pk_live_")?"pk_live":"x"'), []),
    ).toEqual([]);
    expect(scanText(js("const key=`pk_live_${encoded}`;"), [])).toEqual([]);
  });
  it("applies a non-JavaScript exemption only when it opts in", () => {
    const exemption: CountedExemption = {
      scope: /third-party-licenses\.json$/,
      literal: '"sourceUrl":"https://github.com/pingdotgg/t3code"',
      count: 1,
      reason: "MIT notice",
      source: "fixture:1",
    };
    const notice: ScanFile = {
      artifact: "client/third-party-licenses.json",
      scope: "client/third-party-licenses.json",
      text: `[{${exemption.literal}}]`,
      javascript: false,
    };
    expect(scanText(notice, [exemption]).some((item) => item.rule === "upstream-owner")).toBe(true);
    expect(scanText(notice, [{ ...exemption, text: true }])).toEqual([]);
    expect(
      scanText({ ...notice, text: `${notice.text} pingdotgg` }, [{ ...exemption, text: true }]),
    ).toHaveLength(1);
  });
  it("lets a derived compile cache hold permitted literals at any count, and nothing else", () => {
    const exemption: CountedExemption = {
      scope: /server\.mjs$/,
      literal: "https://t3.codes/schema/t3.json",
      count: 1,
      reason: "fixture",
      source: "fixture:1",
    };
    const cache = (text: string): ScanFile => ({
      artifact: "app/Contents/Resources/server-compile-cache/72616544",
      scope: "app/Contents/Resources/server-compile-cache/72616544",
      text,
      javascript: false,
    });
    const source = js(exemption.literal, "apps/server/dist/server.mjs");
    const sibling = { ...exemption, scope: /main\.cjs$/ };
    expect(
      scanCollection(
        [source, js(exemption.literal, "dist-electron/main.cjs"), cache(exemption.literal)],
        [exemption, sibling],
        [],
      ),
    ).toEqual([]);
    expect(
      scanCollection(
        [source, cache(`\x00${exemption.literal}\x00${exemption.literal}`)],
        [exemption],
        [],
      ),
    ).toEqual([]);
    expect(
      scanCollection(
        [source, cache(`\x00${exemption.literal}\x00app.t3.codes`)],
        [exemption],
        [],
      ).map((item) => item.rule),
    ).toEqual(["t3-domain"]);
    expect(
      scanCollection(
        [js("removed", "apps/server/dist/server.mjs"), cache(exemption.literal)],
        [exemption],
        [],
      ).some((item) => item.rule === "t3-domain"),
    ).toBe(true);
  });
  it("counts chunk families together and fails when an entire exempted chunk disappears", () => {
    const exemption: CountedExemption = {
      scope: /utils-.*\.js$/,
      literal: "t3.codes",
      count: 1,
      reason: "fixture",
      source: "fixture:1",
    };
    expect(
      scanCollection(
        [js("t3.codes", "utils-one.js"), js("empty", "utils-two.js")],
        [exemption],
        [],
      ),
    ).toEqual([]);
    expect(
      scanCollection([js("empty", "unrelated.js")], [exemption], []).some((item) =>
        item.rule.startsWith("exemption-count"),
      ),
    ).toBe(true);
  });
  it("ratchets bare names without allowing a scheme construction to hide inside the count", () => {
    const scope = "apps/desktop/dist-electron/compileCache.cjs";
    expect(scanText(js('const name="t3code";', scope), [])).toEqual([]);
    expect(
      scanText(js('const scheme="t3code"; const url=`${scheme}://pair`;', scope), []).some(
        (item) => item.rule === "constructed-upstream-scheme",
      ),
    ).toBe(true);
    expect(
      scanText(js("removed", scope), []).some((item) => item.rule.startsWith("bare-name-count")),
    ).toBe(true);
  });
  it("counts only the permitted Hermes literals in their exact ASCII/UTF-16 representations", () => {
    const utf16 = (text: string) => Buffer.from(text, "utf16le").toString("latin1");
    const literals = [
      utf16(ABOUT_CREDITS),
      "T3 Code",
      "https://github.com/pingdotgg/t3code",
      "https://t3.codes/schema/t3.json",
      utf16("https://t3.codes/schema/t3.json"),
      "See https://t3.codes for documentation.",
      utf16("See https://t3.codes for documentation."),
    ];
    const file = {
      artifact: "fixture.aab!/base/assets/index.android.bundle",
      scope: "base/assets/index.android.bundle",
      text: literals.join("\0"),
      javascript: false,
    };
    expect(scanText(file)).toEqual([]);
    for (const literal of literals) {
      for (const text of [file.text.replace(literal, ""), `${file.text}\0${literal}`]) {
        const failures = scanText({ ...file, text });
        expect(failures.some((item) => item.rule.startsWith("exemption-count"))).toBe(true);
        if (text.length > file.text.length)
          expect(failures.some((item) => !item.rule.startsWith("exemption-count"))).toBe(true);
      }
    }
    for (const text of [`${file.text}\0Update T3 Code`, `${file.text}\0${utf16("T3 Code")}`])
      expect(scanText({ ...file, text }).some((item) => item.rule === "upstream-name")).toBe(true);
    expect(scanText({ ...file, scope: "other/index.android.bundle" }).length).toBeGreaterThan(0);
    expect(
      scanText({ ...file, text: file.text.replace(utf16(ABOUT_CREDITS), ABOUT_CREDITS) }).some(
        (item) => item.rule.startsWith("exemption-count"),
      ),
    ).toBe(true);
    expect(HERMES_COUNTED_EXEMPTIONS.every((item) => item.reason && item.source)).toBe(true);
  });
  it("leaves Hermes bare tokens to the JS gate because string-table adjacency is not syntax", () => {
    const text = "t3code\0.t3\0t3code.preferences\0t3code-dev\0t3code-preview\0://";
    for (const value of [text, text.split("\0").reverse().join("\0")]) {
      expect(
        scanText({ ...js(value, "base/assets/index.android.bundle"), javascript: false }, []),
      ).toEqual([]);
    }
    const samples = [
      "T3 Code",
      "t3.codes",
      "pingdotgg",
      "com.t3tools",
      "registry.npmjs.org/t3",
      "u.expo.dev",
      "d763fcb8-d37c-41ea-a773-b54a0ab4a454",
      "phc_fixture",
      "pk_live_abcdefghijkl",
      "t3code-v2",
      "t3code://pair",
      '".t3"',
    ];
    expect(samples).toHaveLength(FORBIDDEN_PATTERNS.length);
    for (const encoding of ["latin1", "utf16le"] as const) {
      const bytes = Buffer.from(samples.join("\0"), encoding).toString("latin1");
      const findings = scanText(
        { ...js(bytes, "base/assets/index.android.bundle"), javascript: false },
        [],
      );
      expect(new Set(findings.map((item) => item.rule))).toEqual(
        new Set(FORBIDDEN_PATTERNS.map(([rule]) => rule)),
      );
      expect(findings.find((item) => item.rule === "upstream-owner")?.offset).toBe(
        bytes.indexOf(Buffer.from("pingdotgg", encoding).toString("latin1")),
      );
    }
  });
  it("ratchets the mobile JS count and rejects constructed schemes even at the allowed count", () => {
    const text = fixture("mobile-bundle.txt");
    const scope = "apps/mobile/index.android.js";
    expect(scanText(js(text, scope))).toEqual([]);
    for (const changed of [text.replace('"t3code"', '"removed"'), `${text}; "t3code";`]) {
      expect(
        scanText(js(changed, scope)).some((item) => item.rule.startsWith("bare-name-count")),
      ).toBe(true);
    }
    const scheme = text.replace(
      'const attribution = "t3code";',
      'const s="t3code"; const url=s+"://pair";',
    );
    const findings = scanText(js(scheme, scope));
    expect(findings.some((item) => item.rule === "constructed-upstream-scheme")).toBe(true);
    expect(findings.some((item) => item.rule.startsWith("bare-name-count"))).toBe(false);
    for (const { literal } of ANDROID_JS_COUNTED_EXEMPTIONS) {
      for (const changed of [text.replace(literal, "removed"), `${text}; ${literal}`])
        expect(
          scanText(js(changed, scope)).some((item) => item.rule.startsWith("exemption-count")),
        ).toBe(true);
    }
    expect(
      scanText(js(`${text}; "T3 Code";`, scope)).some((item) => item.rule === "upstream-name"),
    ).toBe(true);
    expect(scanText(js(text, "unrelated.js")).length).toBeGreaterThan(0);
    using temp = temporary();
    const bundle = NodePath.join(temp.directory, "index-hash.js");
    NodeFS.writeFileSync(bundle, text);
    expect(checkAndroidJs(bundle)).toEqual([]);
    NodeFS.appendFileSync(bundle, '\n"t3code";');
    expect(checkAndroidJs(bundle).some((item) => item.rule.startsWith("bare-name-count"))).toBe(
      true,
    );
    expect(() => main(["--android-aab", "fixture.aab"])).toThrow("requires --android-js");
    expect(() => main(["--bundles", "--android-js", bundle])).toThrow("exactly one artifact mode");
  });
  it("counts only the complete MIT credit and rejects extra app-name copy", () => {
    const scope = "apps/server/dist/client/assets/index-fixture.js";
    const exemptions = COUNTED_EXEMPTIONS.filter(
      (item) => item.literal === ABOUT_CREDITS && item.scope.test(scope),
    );
    expect(exemptions).toHaveLength(1);
    expect(scanText(js(ABOUT_CREDITS, scope), exemptions, false)).toEqual([]);
    expect(
      scanText(js(`${ABOUT_CREDITS} T3 Code`, scope), exemptions, false).map((item) => item.rule),
    ).toEqual(["upstream-name"]);
    for (const text of ["removed", `${ABOUT_CREDITS} ${ABOUT_CREDITS}`]) {
      expect(
        scanText(js(text, scope), exemptions, false).some((item) =>
          item.rule.startsWith("exemption-count"),
        ),
      ).toBe(true);
    }
    expect(
      scanText(js(ABOUT_CREDITS, "unrelated.js"), exemptions, false).map((item) => item.rule),
    ).toEqual(["upstream-name"]);
  });
  it("reports original offsets for escaped text and redacts key material", () => {
    const text = String.raw`const ignored="\u0041"; const key="pk_live_abcdefghijkl";`;
    const hit = scanText(js(text), []).find((item) => item.rule === "clerk-key")!;
    expect(hit.offset).toBe(text.indexOf("pk_live_"));
    expect(hit.context).not.toContain("abcdefghijkl");
    const binary = Buffer.from("phc_fixture_secret", "utf16le").toString("latin1");
    const hermes = scanText(
      { ...js(binary, "base/assets/index.android.bundle"), javascript: false },
      [],
    );
    expect(hermes[0]?.rule).toBe("posthog-key");
    expect(hermes[0]?.offset).toBe(0);
    expect(hermes[0]?.context).toContain("[redacted key]");
    expect(hermes[0]?.context).not.toContain("fixture_secret");
    expect(redact("value local-password", { CSC_KEY_PASSWORD: "local-password" })).toBe(
      "value [redacted]",
    );
  });
});

describe("structural identity gates", () => {
  it("parses the macOS plist and rejects id, scheme and permission drift", () => {
    const text = fixture("Info.plist");
    expect(checkMacPlist(text, "Info.plist", "0.1.9-botduetdot.1")).toEqual([]);
    for (const [before, after] of [
      ["com.ritikrishu.botduetdot", "com.other.app"],
      ["<string>botduetdot-dev</string>", "<string>t3code</string>"],
      ["BotDuetDot uses", "This app uses"],
    ]) {
      expect(checkMacPlist(text.replace(before!, after!), "Info.plist").length).toBeGreaterThan(0);
    }
    expect(
      checkEntitlements(
        '<plist version="1.0"><dict><key>keychain-access-groups</key><array/></dict></plist>',
        "entitlements",
      ),
    ).toHaveLength(1);
  });
  it("parses packaged package.json and YAML feed identity", () => {
    const config = fixture("app-update.yml");
    expect(checkUpdateConfig(config, "app-update.yml")).toEqual([]);
    expect(
      checkUpdateConfig(config.replace("ritikrishu", "someone-else"), "app-update.yml"),
    ).toHaveLength(1);
    expect(() => checkUpdateConfig(config + "owner: duplicate\n", "app-update.yml")).toThrow();
    const manifest = {
      name: "botduetdot",
      productName: "BotDuetDot",
      homepage: "https://ritikrishu.github.io/botduetdot/",
      version: "0.1.9-botduetdot.1",
    };
    expect(checkPackage(JSON.stringify(manifest), "package.json", manifest.version)).toEqual([]);
    expect(
      checkPackage(JSON.stringify({ ...manifest, t3codeWebAuthn: null }), "package.json"),
    ).toHaveLength(1);
  });
  it("requires packaged profile home and Electron userData in both bundles", () => {
    const profile = 'const brand={userDataDirName:"botduetdot",homeDirName:".botduetdot"}';
    const files = [
      js(profile, "apps/desktop/dist-electron/main.cjs"),
      js(profile, "apps/server/dist/chunk-a.mjs"),
    ];
    expect(checkProfiles(files)).toEqual([]);
    expect(checkProfiles([files[0]!, js('userDataDirName:"other"', files[1]!.scope)])).toHaveLength(
      2,
    );
  });
  it("checks Android namespace-aware manifest identity and the permission set", () => {
    const original = fixture("AndroidManifest.xml");
    const check = (text: string) =>
      checkAndroidManifest(text, "AndroidManifest.xml", "0.1.9-botduetdot.1", 2026111601);
    expect(check(original)).toEqual([]);
    expect(
      check(original.replaceAll("android:", "a:").replace("xmlns:android", "xmlns:a")),
    ).toEqual([]);
    for (const [before, after] of [
      ['package="com.ritikrishu.botduetdot"', 'package="com.other.app"'],
      ['android:versionCode="2026111601"', 'android:versionCode="2026111600"'],
      ['android:scheme="botduetdot"', 'android:scheme="t3code"'],
      ["<intent-filter>", '<intent-filter android:autoVerify="true">'],
      ['android:scheme="clerk"', 'android:scheme="clerk" android:host="app.t3.codes"'],
      ["botduetdot.fileprovider", "botduetdot-evil.fileprovider"],
      ["botduetdot.INTERNAL", "other.INTERNAL"],
      ["android.permission.CAMERA", "android.permission.SYSTEM_ALERT_WINDOW"],
      ['android:value="false"', 'android:value="true"'],
    ])
      expect(check(original.replace(before!, after!)).length).toBeGreaterThan(0);
    expect(() => check("<manifest><broken></manifest>")).toThrow();
  });
  it("rejects embedded Expo ownership and update URLs", () => {
    const config = fixture("app.config.json");
    expect(checkExpoConfig(config, "app.config")).toEqual([]);
    for (const extra of [
      { owner: "anyone" },
      { extra: { eas: {} } },
      { updates: { url: "https://example.com" } },
    ]) {
      expect(
        checkExpoConfig(JSON.stringify({ ...JSON.parse(config), ...extra }), "app.config").length,
      ).toBeGreaterThan(0);
    }
  });
  it("validates every localized app_name, including non-string resource references", () => {
    const dump =
      "Package 'com.ritikrishu.botduetdot':\n0x7f120001 - string/app_name\n\t(default) - [STR] \"BotDuetDot\"\n";
    expect(checkAndroidAppName(dump, "resources")).toEqual([]);
    expect(
      checkAndroidAppName(dump + '\tlanguage: "fr" - [STR] "T3 Code"\n', "resources"),
    ).toHaveLength(1);
    expect(
      checkAndroidAppName(dump + '\tlanguage: "fr" - [REF] 0x7f120002\n', "resources"),
    ).toHaveLength(1);
    expect(checkAndroidAppName("no values", "resources")).toHaveLength(1);
  });
  it("checks update metadata against the bytes to be shipped", () => {
    using temp = temporary();
    const version = "0.1.9-botduetdot.1";
    const files = ["zip", "dmg"].map((ext) => {
      const url = `BotDuetDot-${version}-arm64.${ext}`;
      const bytes = Buffer.from(`fixture ${ext}`);
      NodeFS.writeFileSync(NodePath.join(temp.directory, url), bytes);
      return {
        url,
        size: bytes.length,
        sha512: NodeCrypto.createHash("sha512").update(bytes).digest("base64"),
      };
    });
    NodeFS.writeFileSync(
      NodePath.join(temp.directory, "latest-mac.yml"),
      JSON.stringify({ version, path: files[0]!.url, sha512: files[0]!.sha512, files }),
    );
    expect(checkUpdateManifest(temp.directory, version)).toEqual([]);
    NodeFS.appendFileSync(NodePath.join(temp.directory, files[0]!.url), "tampered");
    expect(checkUpdateManifest(temp.directory, version).length).toBeGreaterThan(0);
  });
});

it("the shared release gate emits nothing for a leaking fixture or a modified checked artifact", () => {
  using temp = temporary();
  const artifact = NodePath.join(temp.directory, "release.zip");
  const output = NodePath.join(temp.directory, "published");
  NodeFS.writeFileSync(artifact, 'const scheme="t3code";');
  const emit = () => NodeFS.copyFileSync(artifact, output);
  expect(() =>
    gateArtifacts([artifact], () => scanText(js(NodeFS.readFileSync(artifact, "utf8")), []), emit),
  ).toThrow("Release blocked");
  expect(NodeFS.existsSync(output)).toBe(false);
  expect(() =>
    gateArtifacts(
      [artifact],
      () => {
        NodeFS.appendFileSync(artifact, "changed");
        return [];
      },
      emit,
    ),
  ).toThrow("changed during verification");
  expect(NodeFS.existsSync(output)).toBe(false);
  gateArtifacts([artifact], () => [], emit);
  expect(NodeFS.readFileSync(output, "utf8")).toBe(NodeFS.readFileSync(artifact, "utf8"));

  const companion = NodePath.join(temp.directory, "index.android.js");
  NodeFS.writeFileSync(companion, fixture("mobile-bundle.txt"));
  const digests = gateArtifacts(
    [artifact, companion],
    () => checkAndroidJs(companion),
    (hashes) => hashes,
  );
  expect(digests[1]).toBe(
    NodeCrypto.createHash("sha256").update(NodeFS.readFileSync(companion)).digest("hex"),
  );
  expect(() =>
    gateArtifacts(
      [artifact, companion],
      () => {
        NodeFS.appendFileSync(companion, "\n// changed after inspection");
        return [];
      },
      () => {
        throw new Error("must not emit");
      },
    ),
  ).toThrow("changed during verification");
  NodeFS.appendFileSync(companion, '\n"t3code";');
  expect(() =>
    gateArtifacts(
      [artifact, companion],
      () => checkAndroidJs(companion),
      () => {
        throw new Error("must not emit");
      },
    ),
  ).toThrow("Release blocked");
});

it("refuses an artifact swapped between verification and output", () => {
  using temp = temporary();
  const artifact = NodePath.join(temp.directory, "release.zip");
  const output = NodePath.join(temp.directory, "published");
  NodeFS.writeFileSync(artifact, "const safe = 1;");
  expect(() =>
    gateArtifacts(
      [artifact],
      () => scanText(js(NodeFS.readFileSync(artifact, "utf8")), []),
      ([digest]) => {
        NodeFS.writeFileSync(artifact, 'const host = "t3.codes";');
        copyVerified(artifact, output, digest!);
      },
    ),
  ).toThrow("changed after verification");
  expect(NodeFS.existsSync(output)).toBe(false);
});
