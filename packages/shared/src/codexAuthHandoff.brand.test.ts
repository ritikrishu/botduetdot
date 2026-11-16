import { EnvironmentId, ProviderInstanceId } from "@t3tools/contracts";
import { STANDALONE_BRAND, UPSTREAM_BRAND } from "@t3tools/contracts/brandProfiles";
import { afterEach, expect, it, vi } from "vite-plus/test";

afterEach(() => {
  vi.doUnmock("@t3tools/contracts/brand");
  vi.resetModules();
});

it.each([
  { brand: UPSTREAM_BRAND, other: STANDALONE_BRAND, development: false },
  { brand: UPSTREAM_BRAND, other: STANDALONE_BRAND, development: true },
  { brand: STANDALONE_BRAND, other: UPSTREAM_BRAND, development: false },
  { brand: STANDALONE_BRAND, other: UPSTREAM_BRAND, development: true },
])(
  "$brand.id Codex handoff (development=$development) keeps exact schemes",
  async ({ brand, other, development }) => {
    vi.doMock(import("@t3tools/contracts/brand"), async (importOriginal) => ({
      ...(await importOriginal()),
      BRAND: brand,
    }));
    const {
      codexAuthHandoffUrl,
      readCodexAuthHandoff,
      codexAuthDeliveryUrl,
      readCodexAuthDelivery,
    } = await import("./codexAuthHandoff.ts");
    const state = "a".repeat(43);
    const authorization = new URL("https://auth.openai.com/api/accounts/authorize");
    authorization.search = new URLSearchParams({
      client_id: "dynamic_agent_client",
      response_type: "code",
      redirect_uri: "http://127.0.0.1:54213/auth/callback",
      state,
      code_challenge_method: "S256",
      code_challenge: "b".repeat(43),
    }).toString();
    const scheme = development ? brand.schemes.development : brand.schemes.production;
    const input = {
      authorizationUrl: authorization.toString(),
      returnUrl: `${brand.hostedApp.url}/welcome#agents:remote`,
      environmentId: EnvironmentId.make("remote"),
      instanceId: ProviderInstanceId.make("codex"),
      flowId: "flow-one",
    };
    const link = codexAuthHandoffUrl(input, development);
    expect(new URL(link).protocol).toBe(`${scheme}:`);
    expect(readCodexAuthHandoff(link, development)).toEqual(input);
    expect(readCodexAuthHandoff(link, !development)).toBeUndefined();
    for (const rejected of [
      ...Object.values(other.schemes),
      brand.schemes.preview,
      `${brand.slug}-nightly`,
      `${brand.slug}-attacker`,
      `${other.slug}-attacker`,
    ]) {
      expect(
        readCodexAuthHandoff(link.replace(`${scheme}:`, `${rejected}:`), development),
      ).toBeUndefined();
    }
    const callbackUrl = `http://127.0.0.1:54213/auth/callback?state=${state}&code=one-time-code`;
    for (const returnUrl of [input.returnUrl, `${scheme}://app/welcome#agents:remote`]) {
      const handoff = { ...input, returnUrl };
      expect(readCodexAuthHandoff(codexAuthHandoffUrl(handoff, development), development)).toEqual(
        handoff,
      );
      const delivery = codexAuthDeliveryUrl(handoff, callbackUrl);
      expect(new URL(delivery).search).toBe("");
      expect(readCodexAuthDelivery(delivery)).toEqual({
        environmentId: input.environmentId,
        instanceId: input.instanceId,
        flowId: input.flowId,
        callbackUrl,
        returnHash: "#agents:remote",
        returnUrl,
      });
    }
    for (const returnUrl of [
      `${other.hostedApp.url}/welcome`,
      `${other.schemes.production}://app/welcome`,
      `${brand.schemes.preview}://app/welcome`,
      `${brand.slug}-attacker://app/welcome`,
    ]) {
      const handoff = { ...input, returnUrl };
      expect(
        readCodexAuthHandoff(codexAuthHandoffUrl(handoff, development), development),
      ).toBeUndefined();
      expect(() => codexAuthDeliveryUrl(handoff, callbackUrl)).toThrow();
    }
    const delivery = codexAuthDeliveryUrl(input, callbackUrl);
    expect(
      readCodexAuthDelivery(delivery.replace(brand.hostedApp.url, other.hostedApp.url)),
    ).toBeUndefined();
  },
);
