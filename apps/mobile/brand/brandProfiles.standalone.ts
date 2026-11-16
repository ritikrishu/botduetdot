// Metro bundles every module it resolves and cannot drop the unused upstream profile the way the
// Vite builds do, so standalone mobile builds resolve the profile module to this one instead.
// Nothing outside the brand modules reads UPSTREAM_BRAND or picks a profile at runtime.
import type { BrandProfile } from "../../../packages/contracts/src/brandProfiles.ts";
import { defineStandaloneBrand } from "../../../packages/contracts/src/brandStandalone.ts";

export type { BrandProfile };
export { defineStandaloneBrand };

export const STANDALONE_BRAND = /* @__PURE__ */ defineStandaloneBrand();

// On device only the inlined EXPO_PUBLIC_T3CODE_BRAND is defined, so a missing id means this build.
export function resolveBrandProfile(id: string | undefined): BrandProfile {
  if (id === undefined || id === "standalone") return STANDALONE_BRAND;
  throw new Error(`This build ships only the standalone brand; it cannot resolve "${id}".`);
}
