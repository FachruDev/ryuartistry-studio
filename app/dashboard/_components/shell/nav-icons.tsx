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
  "/dashboard/agents": (p) => (
    <svg {...base} {...p}>
      <circle cx="9" cy="8.5" r="3" />
      <path d="M3.5 19c.6-3 2.8-4.5 5.5-4.5s4.9 1.5 5.5 4.5M16 6.5a2.75 2.75 0 0 1 0 5M17.5 14.8c1.7.6 2.7 2 3 4.2" />
    </svg>
  ),
  "/dashboard/automation": (p) => (
    <svg {...base} {...p}>
      <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
      <circle cx="16" cy="7" r="2" />
      <circle cx="10" cy="17" r="2" />
    </svg>
  ),
};

export function IconBell(p: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} width={17} height={17} {...p}>
      <path d="M6.5 16.5V11a5.5 5.5 0 0 1 11 0v5.5l1.5 2h-14zM10 20.5a2.2 2.2 0 0 0 4 0" />
    </svg>
  );
}

export function IconChevron(p: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} width={16} height={16} {...p}>
      <path d="m14.5 6-6 6 6 6" />
    </svg>
  );
}

export function IconKey(p: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} width={16} height={16} {...p}>
      <circle cx="8" cy="15.5" r="4" />
      <path d="m10.8 12.7 8.7-8.7M16.5 7l2.5 2.5M14 9.5l2 2" />
    </svg>
  );
}

export function IconLogout(p: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} width={16} height={16} {...p}>
      <path d="M14.5 4.5h3a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2h-3M10 16.5 5.5 12 10 7.5M5.5 12h9" />
    </svg>
  );
}
