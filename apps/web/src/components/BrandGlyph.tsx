import type { SVGProps } from "react";

/** The standalone brand mark (assets/brand/standalone/widget-mark.svg), drawn in currentColor. */
export function BrandGlyph(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} viewBox="184 147 640 640" xmlns="http://www.w3.org/2000/svg">
      <circle cx="360" cy="560" r="168" fill="currentColor" />
      <circle cx="680" cy="560" r="136" fill="currentColor" />
      <circle cx="650" cy="270" r="64" fill="currentColor" />
    </svg>
  );
}
