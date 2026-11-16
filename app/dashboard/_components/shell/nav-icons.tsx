/** Hairline navigation glyphs, one per section. */
import type { SVGProps } from "react";

const base = {
  viewBox: "0 0 24 24",
  width: 18,
  height: 18,
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.25,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

export const NAV_ICONS: Record<string, (p: SVGProps<SVGSVGElement>) => React.ReactElement> = {
  "/dashboard": (p) => (
    <svg {...base} {...p}>
      <rect x="3.5" y="3.5" width="7" height="9" rx="2" />
      <rect x="13.5" y="3.5" width="7" height="5" rx="2" />
      <rect x="13.5" y="11.5" width="7" height="9" rx="2" />
      <rect x="3.5" y="15.5" width="7" height="5" rx="2" />
    </svg>
  ),
  "/dashboard/adobe": (p) => (
    <svg {...base} {...p}>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
      <circle cx="9" cy="10" r="1.75" />
      <path d="m20 16-4.5-4.5L7 19.5" />
    </svg>
  ),
  "/dashboard/reels": (p) => (
    <svg {...base} {...p}>
      <rect x="6.5" y="2.5" width="11" height="19" rx="2.5" />
      <path d="m10.5 9.5 4 2.5-4 2.5z" />
    </svg>
  ),
  "/dashboard/research": (p) => (
    <svg {...base} {...p}>
      <circle cx="10.5" cy="10.5" r="6" />
      <path d="m15 15 5.5 5.5M8 10.5h5M10.5 8v5" />
    </svg>
  ),
  "/dashboard/performance": (p) => (
    <svg {...base} {...p}>
      <path d="M4 19.5h16M7 16v-4M11.5 16V8M16 16v-6.5" />
    </svg>
  ),
};

export function IconLogout(p: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} width={16} height={16} {...p}>
      <path d="M14.5 4.5h3a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2h-3M10 16.5 5.5 12 10 7.5M5.5 12h9" />
    </svg>
  );
}
