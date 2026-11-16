import type { BrandProfile } from "@t3tools/contracts/brandProfiles";

export function transformBrandHtml(html: string, brand: BrandProfile): string {
  if (brand.id !== "standalone") return html;

  const name = brand.name
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
  return html.replace(/T3 Code(?: \(Beta\))?/g, () => name);
}
