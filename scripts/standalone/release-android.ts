#!/usr/bin/env node
// @effect-diagnostics nodeBuiltinImport:off - Release staging and verification must finish before emitting an AAB.
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";
import * as NodeUtil from "node:util";
import { resolveBrandProfile } from "@t3tools/contracts/brandProfiles";
import { assertBrandBuildEnv } from "../lib/brand-define.ts";
import { loadRepoEnv } from "../lib/public-config.ts";
import { validateVersion, validateVersionCode } from "./brand-leak-rules.ts";
import {
  checkAndroidAab,
  checkAndroidJs,
  command,
  copyVerified,
  gateArtifacts,
  print,
  printError,
  redact,
  REPO_ROOT,
  requireCleanTree,
  run,
  sha256,
  walkFiles,
  type Environment,
} from "./check-brand-leaks.ts";

const REQUIRED_ENV = [
  "STANDALONE_UPLOAD_STORE_FILE",
  "STANDALONE_UPLOAD_STORE_PASSWORD",
  "STANDALONE_UPLOAD_KEY_ALIAS",
  "STANDALONE_UPLOAD_KEY_PASSWORD",
  "STANDALONE_UPLOAD_CERT_SHA256",
] as const;
const HELP = `Usage: node scripts/standalone/release-android.ts [--version X.Y.Z-botduetdot.N] [--version-code YYYYMMDDNN] [--previous-version-code N] [--dry-run]
Version defaults: T3CODE_MOBILE_VERSION, T3CODE_ANDROID_VERSION_CODE.
--previous-version-code or STANDALONE_ANDROID_PREVIOUS_VERSION_CODE must be the highest code used on ANY Play track (0 for first upload).
--dry-run works without signing credentials; it prints missing prerequisites and never runs prebuild, Gradle or export.
Required signing env ONLY: STANDALONE_UPLOAD_STORE_FILE (absolute keystore path outside checkout),
STANDALONE_UPLOAD_STORE_PASSWORD, STANDALONE_UPLOAD_KEY_ALIAS, STANDALONE_UPLOAD_KEY_PASSWORD,
STANDALONE_UPLOAD_CERT_SHA256 (expected upload certificate, colon-separated or 64 hex digits).
Toolchains: JAVA_HOME (JDK 17), ANDROID_HOME or ANDROID_SDK_ROOT, vp, bundletool, unzip, keytool, jarsigner.
The wrapper sets T3CODE_BRAND=standalone, EXPO_PUBLIC_T3CODE_BRAND=standalone, APP_VARIANT=production,
T3CODE_MOBILE_UPDATES_ENABLED=0, EXPO_NO_GIT_STATUS=1, NODE_ENV=production.
Requires clean git. Expo --clean regenerates ignored apps/mobile/android; do not hand-edit native files.
Builds :app:bundleRelease, then expo export --platform android --no-bytecode into a private temp directory
with the same release environment. Gates the JS bundle together with staged AAB manifests, Hermes bytes,
Expo config, every JAR entry and the upload certificate. Copies only checked bytes to
release/android/BotDuetDot-<version>-<code>.aab with .sha256 and .build.json (including androidJsSha256).
No Play upload. Enrol in Play App Signing and upload that AAB in Play Console.
Example: node scripts/standalone/release-android.ts --version 0.1.9-botduetdot.1 --version-code 2026111601 --previous-version-code 0 --dry-run`;

export function androidCredentialProblems(env: Environment): string[] {
  return REQUIRED_ENV.filter((key) => !env[key]).map((key) => `Missing ${key}.`);
}
export function normalizeFingerprint(value: string): string {
  const result = value.replaceAll(":", "").toUpperCase();
  if (!/^[A-F\d]{64}$/.test(result))
    throw new Error("STANDALONE_UPLOAD_CERT_SHA256 must be a SHA-256 certificate fingerprint.");
  return result;
}
export function verifyAndroidSignature(
  certificate: string,
  jarVerification: string,
  expected: string,
): void {
  const fingerprints = [...certificate.matchAll(/SHA256:\s*([A-Fa-f\d:]+)/g)].map((match) =>
    normalizeFingerprint(match[1]!),
  );
  if (
    fingerprints.length !== 1 ||
    fingerprints[0] !== normalizeFingerprint(expected) ||
    /CN\s*=\s*Android Debug/i.test(certificate)
  )
    throw new Error("AAB signer must be the expected non-debug upload certificate.");
  // Bundle tools do not write the manifest first, so JarInputStream cannot see it and jarsigner
  // notes every entry; that is expected for an AAB. The verbose entry flags are the real check.
  const relevant = jarVerification.replace(BENIGN_JAR_INPUT_STREAM_NOTES, "");
  const entries = jarEntries(jarVerification);
  if (
    !/jar verified\./.test(relevant) ||
    /jar is unsigned|unsigned entries|not signed|treated as unsigned/i.test(relevant) ||
    !entries.some((entry) => entry.signed) ||
    entries.some((entry) => !entry.signed && !JAR_SIGNATURE_FILE.test(entry.name))
  )
    throw new Error("AAB JAR signature is missing, invalid, or leaves unsigned entries.");
}
const BENIGN_JAR_INPUT_STREAM_NOTES =
  /^- (?:Entry .+ is signed in JarFile but is not signed in JarInputStream|Manifest is missing when reading via JarInputStream)$/gm;
const JAR_SIGNATURE_FILE = /^META-INF\/[^/]+\.(?:SF|RSA|DSA|EC)$/;
/** Entries from `jarsigner -verify -verbose`: flags, size, date, then the entry name. */
export function jarEntries(verbose: string): { readonly signed: boolean; readonly name: string }[] {
  return [
    ...verbose.matchAll(/^([ s][ m][ k][ i]) +\d+ \w{3} \w{3} \d{2} [\d:]{8} \S+ \d{4} (.+)$/gm),
  ].map((match) => ({ signed: match[1]!.startsWith("s"), name: match[2]! }));
}
export function main(args = process.argv.slice(2)): void {
  const { values } = NodeUtil.parseArgs({
    args,
    options: {
      help: { type: "boolean" },
      version: { type: "string" },
      "version-code": { type: "string" },
      "previous-version-code": { type: "string" },
      "dry-run": { type: "boolean" },
    },
  });
  if (values.help) {
    print(HELP);
    return;
  }
  const version = validateVersion(values.version ?? process.env.T3CODE_MOBILE_VERSION ?? "");
  const previous =
    values["previous-version-code"] ?? process.env.STANDALONE_ANDROID_PREVIOUS_VERSION_CODE;
  const code = validateVersionCode(
    values["version-code"] ?? process.env.T3CODE_ANDROID_VERSION_CODE ?? "",
    previous,
  );
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    T3CODE_BRAND: "standalone",
    EXPO_PUBLIC_T3CODE_BRAND: "standalone",
    APP_VARIANT: "production",
    T3CODE_MOBILE_VERSION: version,
    T3CODE_ANDROID_VERSION_CODE: String(code),
    T3CODE_MOBILE_UPDATES_ENABLED: "0",
    EXPO_NO_GIT_STATUS: "1",
    NODE_ENV: "production",
    DEBUG: "",
    LC_ALL: "C",
    LANG: "C",
  };
  const problems = androidCredentialProblems(env);
  if (previous === undefined)
    problems.push(
      "Set --previous-version-code or STANDALONE_ANDROID_PREVIOUS_VERSION_CODE (0 for first Play upload).",
    );
  if (!env.JAVA_HOME) problems.push("Set JAVA_HOME to JDK 17.");
  if (!env.ANDROID_HOME && !env.ANDROID_SDK_ROOT)
    problems.push("Set ANDROID_HOME or ANDROID_SDK_ROOT.");
  let commit = "";
  try {
    commit = requireCleanTree();
  } catch {
    problems.push("Commit all checkout changes before releasing.");
  }
  try {
    assertBrandBuildEnv(loadRepoEnv(), resolveBrandProfile("standalone"));
  } catch (error) {
    problems.push(error instanceof Error ? error.message : "Forbidden brand environment.");
  }
  const output = NodePath.join(REPO_ROOT, "release/android", `BotDuetDot-${version}-${code}.aab`);
  if ([output, `${output}.sha256`, `${output}.build.json`].some((file) => NodeFS.existsSync(file)))
    problems.push("Release output already exists; increase versionCode.");
  if (values["dry-run"]) {
    print(
      `DRY RUN ${version} (${code}): expo prebuild --clean --platform android --no-install; gradlew :app:bundleRelease; stage privately; expo export --platform android --no-bytecode; verify signature + certificate; gate exact AAB + JS; record JS SHA-256; emit ${output}.\n${problems.length ? `Missing prerequisites:\n${problems.join("\n")}` : "Local prerequisites present."}\nDeferred: toolchain, keystore and artifact validation.\n${HELP}`,
    );
    return;
  }
  if (problems.length) throw new Error(problems.join("\n"));
  normalizeFingerprint(env.STANDALONE_UPLOAD_CERT_SHA256!);
  const keystore = env.STANDALONE_UPLOAD_STORE_FILE!;
  if (
    !NodePath.isAbsolute(keystore) ||
    !NodeFS.statSync(keystore).isFile() ||
    NodeFS.realpathSync(keystore).startsWith(`${REPO_ROOT}${NodePath.sep}`)
  )
    throw new Error("Upload keystore must be an absolute file outside the checkout.");
  const toolEnv = { ...env, PATH: `${env.JAVA_HOME}/bin:${env.PATH ?? ""}` };
  run("bundletool", ["version"], { env: toolEnv });
  const mobile = NodePath.join(REPO_ROOT, "apps/mobile");
  const temporary = NodeFS.mkdtempSync(
    NodePath.join(NodeOS.tmpdir(), "botduetdot-android-release-"),
  );
  try {
    run("vp", ["exec", "expo", "prebuild", "--clean", "--platform", "android", "--no-install"], {
      cwd: mobile,
      env: toolEnv,
    });
    run("vp", ["exec", "./gradlew", ":app:bundleRelease", "--console=plain", "--no-daemon"], {
      cwd: NodePath.join(mobile, "android"),
      env: toolEnv,
    });
    const staged = NodePath.join(temporary, NodePath.basename(output));
    NodeFS.copyFileSync(
      NodePath.join(mobile, "android/app/build/outputs/bundle/release/app-release.aab"),
      staged,
      NodeFS.constants.COPYFILE_EXCL,
    );
    const jsDirectory = NodePath.join(temporary, "javascript");
    run(
      "vp",
      [
        "exec",
        "expo",
        "export",
        "--platform",
        "android",
        "--no-bytecode",
        "--output-dir",
        jsDirectory,
      ],
      {
        cwd: mobile,
        env: toolEnv,
      },
    );
    const jsBundles = walkFiles(NodePath.join(jsDirectory, "_expo/static/js/android")).filter(
      (file) => file.endsWith(".js"),
    );
    if (jsBundles.length !== 1) throw new Error("Expected exactly one exported Android JS bundle.");
    const jsBundle = jsBundles[0]!;
    const verifiedDigest = gateArtifacts(
      [staged, jsBundle],
      () => {
        const certificate = run(
          NodePath.join(env.JAVA_HOME!, "bin/keytool"),
          ["-J-Duser.language=en", "-printcert", "-jarfile", staged],
          { env: toolEnv },
        );
        const verification = command(
          NodePath.join(env.JAVA_HOME!, "bin/jarsigner"),
          ["-J-Duser.language=en", "-verify", "-verbose", staged],
          { env: toolEnv },
        );
        if (verification.status !== 0) throw new Error("AAB JAR signature verification failed.");
        verifyAndroidSignature(
          certificate,
          verification.stdout + verification.stderr,
          env.STANDALONE_UPLOAD_CERT_SHA256!,
        );
        return [...checkAndroidAab(staged, version, code, toolEnv), ...checkAndroidJs(jsBundle)];
      },
      ([digest, androidJsSha256]) => {
        if (requireCleanTree() !== commit)
          throw new Error("Checkout changed during release build.");
        NodeFS.mkdirSync(NodePath.dirname(output), { recursive: true });
        const stage = NodeFS.mkdtempSync(NodePath.join(NodePath.dirname(output), ".verified-"));
        try {
          const copy = NodePath.join(stage, NodePath.basename(output));
          copyVerified(staged, copy, digest!);
          NodeFS.writeFileSync(`${output}.sha256`, `${digest}  ${NodePath.basename(output)}\n`, {
            flag: "wx",
          });
          NodeFS.writeFileSync(
            `${output}.build.json`,
            JSON.stringify(
              {
                version,
                versionCode: code,
                previousVersionCode: previous,
                commit,
                androidJsSha256,
                uploadCertificateSha256: normalizeFingerprint(env.STANDALONE_UPLOAD_CERT_SHA256!),
              },
              null,
              2,
            ) + "\n",
            { flag: "wx" },
          );
          NodeFS.linkSync(copy, output);
        } finally {
          NodeFS.rmSync(stage, { recursive: true, force: true });
        }
        return digest!;
      },
    );
    if (sha256(output) !== verifiedDigest)
      throw new Error("AAB changed after verification; do not upload it.");
    print(`Verified Play upload AAB: ${output}\nSHA-256: ${verifiedDigest}\nNothing uploaded.`);
  } finally {
    NodeFS.rmSync(temporary, { recursive: true, force: true });
  }
}
if (
  process.argv[1] &&
  NodePath.resolve(process.argv[1]) === NodeURL.fileURLToPath(import.meta.url)
) {
  try {
    main();
  } catch (error) {
    printError(redact(error instanceof Error ? error.message : "Android release failed."));
    process.exitCode = 1;
  }
}
