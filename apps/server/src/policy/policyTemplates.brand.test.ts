import { expect, it, vi } from "vite-plus/test";

async function loadBrand(id: "upstream" | "standalone") {
  vi.resetModules();
  vi.doMock("@t3tools/contracts/brand", async (importOriginal) => {
    const original = await importOriginal<typeof import("@t3tools/contracts/brand")>();
    return { ...original, BRAND: original.resolveBrandProfile(id) };
  });
  return import("./policyTemplates.ts");
}

it.each(["upstream", "standalone"] as const)(
  "%s targets only its own managed policy domain",
  async (id) => {
    const { macosProfile } = await loadBrand(id);
    const profile = macosProfile(
      { schemaVersion: 1, organization: "Test" },
      { profile: "profile-uuid", payload: "payload-uuid" },
    );
    expect(profile._tag).toBe("Valid");
    if (profile._tag !== "Valid") return;
    const domain = id === "upstream" ? "com.t3tools.t3code" : "com.ritikrishu.botduetdot";
    const identities = [
      ...profile.profile.matchAll(
        /<key>(PayloadType|PayloadIdentifier)<\/key>\s*<string>([^<]+)<\/string>/g,
      ),
    ].map((match) => [match[1], match[2]]);
    expect(identities).toEqual([
      ["PayloadIdentifier", `${domain}.policy.payload-uuid`],
      ["PayloadType", domain],
      ["PayloadIdentifier", `${domain}.policy`],
      ["PayloadType", "Configuration"],
    ]);
  },
);
