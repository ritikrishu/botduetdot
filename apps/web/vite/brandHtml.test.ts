// @effect-diagnostics-next-line nodeBuiltinImport:off -- Tests read the unchanged HTML fixture at build time.
import * as NodeFS from "node:fs";
import { resolveBrandProfile } from "@t3tools/contracts/brandProfiles";
import { describe, expect, it } from "vite-plus/test";

import { transformBrandHtml } from "./brandHtml";

const html = NodeFS.readFileSync(new URL("../index.html", import.meta.url), "utf8");

describe("transformBrandHtml", () => {
  it("leaves upstream HTML byte-identical", () => {
    expect(transformBrandHtml(html, resolveBrandProfile("upstream"))).toBe(html);
  });

  it("brands the title and splash labels without changing scripts or styles", () => {
    const brand = resolveBrandProfile("standalone");
    const transformed = transformBrandHtml(html, brand);
    expect(transformed).toContain(`<title>${brand.name}</title>`);
    expect(transformed).toContain(`aria-label="${brand.name} splash screen"`);
    expect(transformed).toContain(`alt="${brand.name}"`);
    expect(transformed).not.toContain("T3 Code");
    expect(transformed.match(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/g)).toEqual(
      html.match(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/g),
    );
  });

  it("also replaces app-name and social metadata while preserving unrelated metadata", () => {
    const metadata = `<meta name="apple-mobile-web-app-title" content="T3 Code">
<meta name="application-name" content="T3 Code (Beta)">
<meta property="og:title" content="T3 Code (Beta)">
<meta name="twitter:title" content="T3 Code">
<meta name="theme-color" content="#000000">`;
    expect(transformBrandHtml(metadata, resolveBrandProfile("upstream"))).toBe(metadata);
    expect(transformBrandHtml(metadata, resolveBrandProfile("standalone"))).toBe(
      metadata.replace(/T3 Code(?: \(Beta\))?/g, "BotDuetDot"),
    );
  });
});
