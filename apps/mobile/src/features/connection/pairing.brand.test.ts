import { expect, it, vi } from "vite-plus/test";
vi.mock("@t3tools/contracts/brand", async (importOriginal) => {
  const original = await importOriginal<typeof import("@t3tools/contracts/brand")>();
  return { ...original, BRAND: original.STANDALONE_BRAND };
});
import { extractPairingUrlFromQrPayload } from "./pairing";
it("unwraps only standalone app schemes while retaining plain LAN URLs", () => {
  const pairing = "http://192.168.1.10:3773/pair#token=fixture";
  for (const scheme of ["botduetdot", "botduetdot-dev", "botduetdot-preview"]) {
    expect(
      extractPairingUrlFromQrPayload(`${scheme}://pair?pairingUrl=${encodeURIComponent(pairing)}`),
    ).toBe(pairing);
  }
  for (const scheme of ["t3code", "t3code-dev", "botduetdot-nightly"]) {
    const input = `${scheme}://pair?pairingUrl=${encodeURIComponent(pairing)}`;
    expect(extractPairingUrlFromQrPayload(input)).toBe(input);
  }
  expect(extractPairingUrlFromQrPayload(pairing)).toBe(pairing);
});
