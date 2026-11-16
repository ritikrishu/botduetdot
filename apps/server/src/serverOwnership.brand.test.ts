import { expect, it, vi } from "vite-plus/test";

async function messages(id: "upstream" | "standalone") {
  vi.resetModules();
  vi.doMock("@t3tools/contracts/brand", async (importOriginal) => {
    const original = await importOriginal<typeof import("@t3tools/contracts/brand")>();
    return { ...original, BRAND: original.resolveBrandProfile(id) };
  });
  const { OlderBootServiceError } = await import("./serverOwnership.ts");
  const { IncompatibleServerProtocolError } = await import("./cli/pair.ts");
  return {
    older: new OlderBootServiceError({ baseDir: "/home/u/.x" }).message,
    pair: new IncompatibleServerProtocolError({ serverVersion: "9.9.9", serverProtocolVersion: 1 })
      .message,
  };
}

it("keeps the upstream npx guidance byte for byte", async () => {
  const { older, pair } = await messages("upstream");
  expect(older).toContain(
    "Pass `--base-dir /home/u/.x` to each command, and use `npx t3@latest` if `t3` is not installed or is outdated. Then retry.",
  );
  expect(pair).toContain("Pair with the matching CLI instead: `npx t3@9.9.9 pair`.");
});

it("never points standalone users at the upstream npm package", async () => {
  const { older, pair } = await messages("standalone");
  expect(older).not.toContain("npx");
  expect(older).toContain("Pass `--base-dir /home/u/.x` to each command. Then retry.");
  expect(pair).not.toContain("npx");
  expect(pair).toContain("Pair with `botduetdot pair` from BotDuetDot 9.9.9 instead.");
});
