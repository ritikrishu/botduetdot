import { resolveBrandProfile, type BrandProfile } from "./brandProfiles.ts";

export {
  defineStandaloneBrand,
  resolveBrandProfile,
  STANDALONE_BRAND,
  UPSTREAM_BRAND,
  type BrandProfile,
} from "./brandProfiles.ts";

declare const __T3CODE_BRAND_PROFILE__: BrandProfile | undefined;
declare const process: {
  readonly env: {
    readonly T3CODE_BRAND?: string;
    readonly EXPO_PUBLIC_T3CODE_BRAND?: string;
  };
};

function resolveBrandFromEnv(): BrandProfile {
  if (typeof process === "undefined") return resolveBrandProfile(undefined);
  // Expo inlines only literal process.env.EXPO_PUBLIC_* member expressions.
  return resolveBrandProfile(process.env.EXPO_PUBLIC_T3CODE_BRAND ?? process.env.T3CODE_BRAND);
}

export const BRAND: BrandProfile =
  typeof __T3CODE_BRAND_PROFILE__ === "object" ? __T3CODE_BRAND_PROFILE__ : resolveBrandFromEnv();

export function brandAppSchemes(brand: BrandProfile): readonly string[] {
  return [brand.schemes.production, brand.schemes.development, brand.schemes.preview];
}

export function brandAppSchemePattern(brand: BrandProfile): RegExp {
  // Upstream pairing/prompt parsers also accept channels such as t3code-nightly:.
  if (brand.id === "upstream") return /^t3code(?:-[a-z]+)?:$/;
  const schemes = brandAppSchemes(brand).map((scheme) =>
    scheme.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
  );
  return new RegExp(`^(?:${schemes.join("|")}):$`);
}

export function isBrandAppProtocol(protocol: string, brand: BrandProfile = BRAND): boolean {
  return brandAppSchemePattern(brand).test(protocol);
}

export function desktopRendererOrigins(brand: BrandProfile): readonly string[] {
  return [brand.schemes.production, brand.schemes.development].map((scheme) => `${scheme}://app`);
}

export function brandRepositoryUrl(path: string, brand: BrandProfile = BRAND): string {
  return `https://github.com/${brand.repository}${path ? `/${path.replace(/^\/+/, "")}` : ""}`;
}
