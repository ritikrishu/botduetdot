import { expect, it, vi } from "vite-plus/test";

async function loadBrand(id: "upstream" | "standalone") {
  vi.resetModules();
  vi.doMock("@t3tools/contracts/brand", async (importOriginal) => {
    const original = await importOriginal<typeof import("@t3tools/contracts/brand")>();
    return { ...original, BRAND: original.resolveBrandProfile(id) };
  });
  return import("./McpOAuth.ts");
}

it.each(["upstream", "standalone"] as const)(
  "%s advertises its own resource identity without changing the authorization boundary",
  async (id) => {
    const { protectedResourceMetadata, authorizationServerMetadata } = await loadBrand(id);
    const urls = {
      issuer: "https://server.example.test",
      resource: "https://server.example.test/mcp",
    };
    expect(protectedResourceMetadata(urls)).toEqual({
      resource: urls.resource,
      authorization_servers: [urls.issuer],
      scopes_supported: ["orchestration:read", "orchestration:operate"],
      bearer_methods_supported: ["header"],
      resource_name: id === "upstream" ? "T3 Code" : "BotDuetDot",
    });
    expect(authorizationServerMetadata(urls)).toMatchObject({
      issuer: urls.issuer,
      authorization_endpoint: `${urls.issuer}/oauth/mcp/authorize`,
      token_endpoint_auth_methods_supported: ["none"],
      code_challenge_methods_supported: ["S256"],
    });
  },
);
