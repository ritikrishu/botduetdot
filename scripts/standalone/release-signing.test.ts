import { expect, it } from "vite-plus/test";
import { macCredentialProblems, verifySignatureDetails } from "./release-desktop-mac.ts";
import {
  androidCredentialProblems,
  normalizeFingerprint,
  verifyAndroidSignature,
} from "./release-android.ts";

it("requires one complete notarization set and an owner signing team", () => {
  expect(macCredentialProblems({}).length).toBeGreaterThan(0);
  const team = { STANDALONE_APPLE_TEAM_ID: "OWNER12345" };
  expect(macCredentialProblems({ ...team, APPLE_KEYCHAIN_PROFILE: "owner-profile" })).toEqual([]);
  expect(
    macCredentialProblems({
      ...team,
      APPLE_API_KEY: "/private/key.p8",
      APPLE_API_KEY_ID: "KEY",
      APPLE_API_ISSUER: "issuer",
    }),
  ).toEqual([]);
  expect(
    macCredentialProblems({
      ...team,
      APPLE_ID: "owner",
      APPLE_APP_SPECIFIC_PASSWORD: "fixture",
      APPLE_TEAM_ID: "OWNER12345",
    }),
  ).toEqual([]);
  for (const env of [
    { APPLE_API_KEY: "/key" },
    { APPLE_API_KEY: "/key", APPLE_KEYCHAIN_PROFILE: "profile" },
    { APPLE_KEYCHAIN_PROFILE: "profile", CSC_LINK: "/cert.p12" },
    { APPLE_KEYCHAIN_PROFILE: "profile", APPLE_TEAM_ID: "OTHER12345" },
    { APPLE_KEYCHAIN_PROFILE: "profile", CSC_IDENTITY_AUTO_DISCOVERY: "false" },
  ])
    expect(macCredentialProblems({ ...team, ...env }).length).toBeGreaterThan(0);
});

it("requires the correct Developer ID, team, runtime and notarized assessment", () => {
  const details =
    "Identifier=com.ritikrishu.botduetdot\nTeamIdentifier=OWNER12345\nAuthority=Developer ID Application: Owner\nCodeDirectory flags=0x10000(runtime)\nCDHash=012345abcdef\n";
  const assessment = "accepted\nsource=Notarized Developer ID";
  expect(verifySignatureDetails(details, assessment, "OWNER12345")).toBe("012345abcdef");
  for (const [before, after] of [
    ["com.ritikrishu.botduetdot", "com.t3tools.t3code"],
    ["OWNER12345", "OTHER12345"],
    ["Developer ID Application:", "Apple Development:"],
    ["runtime", "adhoc"],
    ["CDHash", "MissingHash"],
  ])
    expect(() =>
      verifySignatureDetails(details.replace(before!, after!), assessment, "OWNER12345"),
    ).toThrow();
  expect(() =>
    verifySignatureDetails(details, "accepted\nsource=Unnotarized Developer ID", "OWNER12345"),
  ).toThrow();
});

it("requires env credentials and a fully signed AAB with the pinned upload certificate", () => {
  expect(androidCredentialProblems({})).toHaveLength(5);
  const fingerprint = "AB".repeat(32);
  const certificate = `Owner: CN=Owner\nSHA256: ${fingerprint.match(/../g)!.join(":")}`;
  expect(normalizeFingerprint(fingerprint.toLowerCase())).toBe(fingerprint);
  const entry = (flags: string, name: string) =>
    `${flags}    1245 Thu Jan 01 01:01:02 IST 1981 ${name}`;
  // Real AAB output: every content entry signed, signature files unflagged, JarInputStream notes.
  const aab = [
    entry("sm  ", "base/dex/classes.dex"),
    entry("s   ", "META-INF/MANIFEST.MF"),
    entry("    ", "META-INF/UPLOAD.SF"),
    entry("    ", "META-INF/UPLOAD.RSA"),
    "jar verified.",
    "This JAR file contains internal inconsistencies that may result in different contents when reading via JarFile and JarInputStream:",
    "- Manifest is missing when reading via JarInputStream",
    "- Entry base/dex/classes.dex is signed in JarFile but is not signed in JarInputStream",
  ].join("\n");
  verifyAndroidSignature(certificate, aab, fingerprint);
  for (const [cert, verification] of [
    [certificate.replace("CN=Owner", "CN=Android Debug"), aab],
    [certificate.replace("AB", "CD"), aab],
    [certificate, "jar is unsigned"],
    [certificate, "jar verified."],
    [certificate, `${aab}\nThis jar contains unsigned entries`],
    [certificate, `${aab}\nThe jar is treated as unsigned`],
    [certificate, `${aab}\n${entry("    ", "base/root/extra.properties")}`],
    [certificate, `${aab}\n- Entry base/x is not signed`],
  ])
    expect(() => verifyAndroidSignature(cert!, verification!, fingerprint)).toThrow();
  expect(() => normalizeFingerprint("bad")).toThrow();
});
