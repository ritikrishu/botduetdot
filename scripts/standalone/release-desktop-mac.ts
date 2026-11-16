#!/usr/bin/env node
// @effect-diagnostics nodeBuiltinImport:off - Release orchestration never executes the packaged application.
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";
import * as NodeUtil from "node:util";
import * as HostProcess from "@t3tools/shared/HostProcess";
import { resolveBrandProfile } from "@t3tools/contracts/brandProfiles";
import { assertBrandBuildEnv } from "../lib/brand-define.ts";
import { loadRepoEnv } from "../lib/public-config.ts";
import { RELEASE_IDENTITY, validateVersion } from "./brand-leak-rules.ts";
import {
  checkMacRelease,
  command,
  print,
  printError,
  copyVerified,
  gateArtifacts,
  isInsideCheckout,
  redact,
  REPO_ROOT,
  requireCleanTree,
  run,
  sha256,
  withMacApps,
  type Environment,
} from "./check-brand-leaks.ts";

const HELP = `Usage: node scripts/standalone/release-desktop-mac.ts --version X.Y.Z-botduetdot.N [--dry-run] [--publish] [--notes-file FILE]
Local output: release/mac/<version>/ (five feed artifacts, SHA256SUMS, build provenance).
--dry-run checks inputs and lists missing prerequisites without credentials, building, signing or network access.
--publish alone enables gh release create --repo ritikrishu/botduetdot; it requires --notes-file.
Requires a clean committed checkout, macOS arm64, vp, Rust, Xcode tools, gh authentication, and a public fork.
Signing env: STANDALONE_APPLE_TEAM_ID (10-character owner team), CSC_NAME (optional keychain identity),
or CSC_LINK (absolute path to a .p12 outside the checkout) + CSC_KEY_PASSWORD.
Exactly one notarization set: APPLE_API_KEY (absolute .p8 path) + APPLE_API_KEY_ID + APPLE_API_ISSUER;
or APPLE_KEYCHAIN_PROFILE (+ optional APPLE_KEYCHAIN); or APPLE_ID + APPLE_APP_SPECIFIC_PASSWORD + APPLE_TEAM_ID.
Secrets are read only from process env/keychain. Do not put them in .env, arguments or tracked files.
Optional toolchain env: PATH, RUSTUP_TOOLCHAIN. GH_TOKEN/GITHUB_TOKEN may authenticate gh.
The builder signs, notarizes and staples the app before packaging. Both embedded apps must pass
codesign, stapler validate and spctl exec, with equal CDHashes. The DMG itself is not notarized in v1.
Example: node scripts/standalone/release-desktop-mac.ts --version 0.1.9-botduetdot.1 --dry-run`;

export function macCredentialProblems(env: Environment): string[] {
  const problems: string[] = [];
  if (!/^[A-Z0-9]{10}$/.test(env.STANDALONE_APPLE_TEAM_ID ?? ""))
    problems.push("Set STANDALONE_APPLE_TEAM_ID to the owner's 10-character team ID.");
  const sets = [
    ["APPLE_API_KEY", "APPLE_API_KEY_ID", "APPLE_API_ISSUER"],
    ["APPLE_KEYCHAIN_PROFILE"],
    ["APPLE_ID", "APPLE_APP_SPECIFIC_PASSWORD", "APPLE_TEAM_ID"],
  ];
  // APPLE_TEAM_ID alone may also select a signing team for API-key notarization.
  const active = sets.filter((set) =>
    set.some((key) => key !== "APPLE_TEAM_ID" && Boolean(env[key])),
  );
  if (active.length !== 1)
    problems.push("Supply exactly one notarization credential set; see --help.");
  for (const set of active) for (const key of set) if (!env[key]) problems.push(`Missing ${key}.`);
  if (env.APPLE_TEAM_ID && env.APPLE_TEAM_ID !== env.STANDALONE_APPLE_TEAM_ID)
    problems.push("APPLE_TEAM_ID and STANDALONE_APPLE_TEAM_ID must agree.");
  if (env.APPLE_KEYCHAIN && !env.APPLE_KEYCHAIN_PROFILE)
    problems.push("APPLE_KEYCHAIN requires APPLE_KEYCHAIN_PROFILE.");
  if (env.CSC_LINK && !env.CSC_KEY_PASSWORD) problems.push("Missing CSC_KEY_PASSWORD.");
  if (env.CSC_KEY_PASSWORD && !env.CSC_LINK) problems.push("CSC_KEY_PASSWORD requires CSC_LINK.");
  if (env.CSC_IDENTITY_AUTO_DISCOVERY === "false")
    problems.push("Remove CSC_IDENTITY_AUTO_DISCOVERY=false for a signed release.");
  if (env.CSC_NAME === "-" || env.CSC_NAME === "null")
    problems.push("Ad-hoc signing is forbidden.");
  return problems;
}

function externalSecretPath(value: string, name: string): void {
  if (!NodePath.isAbsolute(value) || !NodeFS.statSync(value).isFile())
    throw new Error(`${name} must be an absolute existing file path.`);
  if (isInsideCheckout(value)) throw new Error(`${name} must be outside the checkout.`);
}
function requireDeveloperId(env: NodeJS.ProcessEnv): void {
  if (env.CSC_LINK) {
    externalSecretPath(env.CSC_LINK, "CSC_LINK");
    const certificate = run(
      "openssl",
      ["pkcs12", "-in", env.CSC_LINK, "-passin", "env:CSC_KEY_PASSWORD", "-clcerts", "-nokeys"],
      { env },
    );
    const subject = run("openssl", ["x509", "-noout", "-subject", "-nameopt", "RFC2253"], {
      input: certificate,
      env,
    });
    if (
      !subject.includes("Developer ID Application:") ||
      !subject.includes(`OU=${env.STANDALONE_APPLE_TEAM_ID}`)
    )
      throw new Error("CSC_LINK must contain the owner's Developer ID Application certificate.");
  } else {
    const identities = run("security", ["find-identity", "-v", "-p", "codesigning"]);
    const matching = identities
      .split("\n")
      .filter(
        (line) =>
          line.includes("Developer ID Application:") &&
          line.includes(`(${env.STANDALONE_APPLE_TEAM_ID})`) &&
          (!env.CSC_NAME || line.includes(env.CSC_NAME)),
      );
    if (matching.length !== 1)
      throw new Error(
        "Select exactly one owner Developer ID Application identity with CSC_NAME, or provide CSC_LINK + CSC_KEY_PASSWORD.",
      );
    env.CSC_NAME = matching[0]!.match(/"([^"]+)"/)?.[1];
  }
}
export function verifySignatureDetails(
  details: string,
  assessment: string,
  teamId: string,
): string {
  if (
    !/^Identifier=com\.ritikrishu\.botduetdot$/m.test(details) ||
    !details.includes(`TeamIdentifier=${teamId}\n`) ||
    !/^Authority=Developer ID Application:/m.test(details) ||
    !/flags=.*\bruntime\b/.test(details)
  )
    throw new Error(
      "App signature must have BotDuetDot identifier, owner team, Developer ID Application and hardened runtime.",
    );
  if (!/accepted/.test(assessment) || !/source=Notarized Developer ID/.test(assessment))
    throw new Error("Gatekeeper must accept a Notarized Developer ID app.");
  const hashes = [...details.matchAll(/^CDHash=([a-f\d]+)$/gm)].map((match) => match[1]!);
  if (hashes.length !== 1) throw new Error("Expected exactly one arm64 CDHash.");
  return hashes[0]!;
}
function verifyMacContainers(directory: string, version: string, teamId: string): void {
  withMacApps(directory, version, (apps) => {
    const hashes = apps.map(({ app }) => {
      run("codesign", ["--verify", "--deep", "--strict", "--verbose=2", app]);
      const details = command("codesign", ["-dv", "--verbose=4", app]);
      if (details.status !== 0) throw new Error("Cannot inspect app signing identity.");
      run("xcrun", ["stapler", "validate", app]);
      const assessment = command("spctl", ["-a", "-vvv", "-t", "exec", app]);
      if (assessment.status !== 0) throw new Error("Gatekeeper rejected an embedded app.");
      return verifySignatureDetails(
        details.stdout + details.stderr,
        assessment.stdout + assessment.stderr,
        teamId,
      );
    });
    if (hashes[0] !== hashes[1]) throw new Error("DMG and update ZIP app CDHashes differ.");
  });
}
// gh release create --target needs the commit on GitHub; check before spending the version.
function requireCommitPublished(commit: string): void {
  const response = command("gh", [
    "api",
    `repos/${RELEASE_IDENTITY.repository}/commits/${commit}`,
    "--silent",
  ]);
  if (response.status !== 0)
    throw new Error(
      `Push commit ${commit.slice(0, 12)} to ${RELEASE_IDENTITY.repository} before publishing.`,
    );
}
function requireReleaseAbsent(version: string): void {
  const tag = `v${version}`;
  if (
    command("gh", [
      "release",
      "view",
      tag,
      "--repo",
      RELEASE_IDENTITY.repository,
      "--json",
      "tagName",
    ]).status === 0
  )
    throw new Error("Release tag already exists; choose a new version.");
  const response = command("gh", [
    "api",
    `repos/${RELEASE_IDENTITY.repository}/releases/tags/${tag}`,
    "--include",
  ]);
  if (response.status === 0 || !/^HTTP\/[\d.]+ 404\b/m.test(response.stdout))
    throw new Error("Could not prove the release is absent (check gh authentication/network).");
  // gh release create reuses an existing tag even when --target names another commit.
  const ref = command("gh", [
    "api",
    `repos/${RELEASE_IDENTITY.repository}/git/ref/tags/${tag}`,
    "--include",
  ]);
  if (ref.status === 0 || !/^HTTP\/[\d.]+ 404\b/m.test(ref.stdout))
    throw new Error(
      `Tag ${tag} already exists on GitHub or could not be checked; choose a new version.`,
    );
  const repository = JSON.parse(
    run("gh", ["repo", "view", RELEASE_IDENTITY.repository, "--json", "isPrivate"]),
  ) as { isPrivate: boolean };
  if (repository.isPrivate !== false)
    throw new Error("The updater requires a public GitHub repository.");
}
export function macReleaseFiles(directory: string, version: string): string[] {
  return ["dmg", "dmg.blockmap", "zip", "zip.blockmap"]
    .map((ext) => NodePath.join(directory, `BotDuetDot-${validateVersion(version)}-arm64.${ext}`))
    .concat(NodePath.join(directory, "latest-mac.yml"));
}

export function main(args = process.argv.slice(2)): void {
  const { values } = NodeUtil.parseArgs({
    args,
    options: {
      help: { type: "boolean" },
      version: { type: "string" },
      "dry-run": { type: "boolean" },
      publish: { type: "boolean" },
      "notes-file": { type: "string" },
    },
  });
  if (values.help) {
    print(HELP);
    return;
  }
  const version = validateVersion(values.version ?? "");
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    T3CODE_BRAND: "standalone",
    T3CODE_DESKTOP_SIGNED: "true",
    T3CODE_DESKTOP_VERBOSE: "false",
    DEBUG: "",
  };
  const problems = macCredentialProblems(env);
  if (
    HostProcess.Platform.defaultValue() !== "darwin" ||
    HostProcess.Architecture.defaultValue() !== "arm64"
  )
    problems.push("Use an Apple-silicon Mac.");
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
  if (values.publish && !values["notes-file"]) problems.push("--publish requires --notes-file.");
  if (!env.CSC_LINK) {
    const identities = command("security", ["find-identity", "-v", "-p", "codesigning"]);
    if (identities.status !== 0 || !identities.stdout.includes("Developer ID Application:"))
      problems.push(
        "Install a Developer ID Application identity or set CSC_LINK + CSC_KEY_PASSWORD.",
      );
  }
  const output = NodePath.join(REPO_ROOT, "release/mac", version);
  if (NodeFS.existsSync(output))
    problems.push("The release/mac/<version> output already exists; use a new version.");
  if (values["dry-run"]) {
    print(
      `DRY RUN ${version}: build signed arm64 DMG + ZIP in a private temporary directory; verify both app signatures/tickets/CDHashes; check both artifacts; emit ${output}${values.publish ? "; then publish to ritikrishu/botduetdot" : "; local only"}.\n${problems.length ? `Missing prerequisites:\n${problems.join("\n")}` : "Local prerequisites present."}\nDeferred: gh authentication/public-repo/release-absence check, certificate validation, artifact build and verification.\n${HELP}`,
    );
    return;
  }
  if (problems.length) throw new Error(problems.join("\n"));
  if (env.APPLE_API_KEY) externalSecretPath(env.APPLE_API_KEY, "APPLE_API_KEY");
  requireDeveloperId(env);
  requireReleaseAbsent(version);
  if (values.publish) requireCommitPublished(commit);
  const notes = values["notes-file"]
    ? NodeFS.readFileSync(NodePath.resolve(values["notes-file"]), "utf8")
    : "";
  const temporary = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "botduetdot-mac-release-"));
  try {
    run(
      "vp",
      [
        "run",
        "dist:desktop:artifact",
        "--platform",
        "mac",
        "--target",
        "dmg",
        "--arch",
        "arm64",
        "--build-version",
        version,
        "--signed",
        "--output-dir",
        temporary,
      ],
      { env },
    );
    const files = macReleaseFiles(temporary, version);
    const verified = gateArtifacts(
      files,
      () => {
        verifyMacContainers(temporary, version, env.STANDALONE_APPLE_TEAM_ID!);
        return checkMacRelease(temporary, version);
      },
      (digests) => {
        if (requireCleanTree() !== commit)
          throw new Error("Checkout changed during the release build.");
        NodeFS.mkdirSync(NodePath.dirname(output), { recursive: true });
        const stage = NodeFS.mkdtempSync(NodePath.join(NodePath.dirname(output), ".verified-"));
        try {
          for (const [index, file] of files.entries())
            copyVerified(file, NodePath.join(stage, NodePath.basename(file)), digests[index]!);
          NodeFS.writeFileSync(
            NodePath.join(stage, "SHA256SUMS"),
            files.map((file, index) => `${digests[index]}  ${NodePath.basename(file)}\n`).join(""),
          );
          NodeFS.writeFileSync(
            NodePath.join(stage, "build.json"),
            JSON.stringify(
              {
                version,
                commit,
                arch: "arm64",
                node: process.version,
                rust: run("rustc", ["--version"]).trim(),
              },
              null,
              2,
            ) + "\n",
          );
          NodeFS.renameSync(stage, output);
        } finally {
          NodeFS.rmSync(stage, { recursive: true, force: true });
        }
        return digests;
      },
    );
    if (values.publish) {
      const publishedFiles = macReleaseFiles(output, version);
      const notesPath = NodePath.join(temporary, "release-notes.md");
      NodeFS.writeFileSync(notesPath, notes, { mode: 0o600 });
      requireReleaseAbsent(version);
      if (publishedFiles.some((file, index) => sha256(file) !== verified[index]))
        throw new Error("Artifact changed after verification; refusing to publish.");
      run("gh", [
        "release",
        "create",
        `v${version}`,
        "--repo",
        RELEASE_IDENTITY.repository,
        "--target",
        commit,
        "--title",
        `BotDuetDot ${version}`,
        "--notes-file",
        notesPath,
        "--latest",
        ...publishedFiles,
      ]);
    }
    print(
      `Verified artifacts: ${output}\nCommit: ${commit}\n${values.publish ? "Published to ritikrishu/botduetdot." : "Local artifacts only; nothing published."}`,
    );
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
    printError(redact(error instanceof Error ? error.message : "macOS release failed."));
    process.exitCode = 1;
  }
}
