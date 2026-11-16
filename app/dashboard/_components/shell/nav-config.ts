export type NavCounts = { approvals: number; adobe: number; reels: number; halted: number };

export type NavItem = {
  href: string;
  label: string;
  /** Short description for the topbar under the page title. */
  hint: string;
  count?: keyof NavCounts;
};

export const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: "Studio",
    items: [{ href: "/dashboard", label: "Ringkasan", hint: "Keputusan dan status hari ini", count: "approvals" }],
  },
  {
    label: "Produksi",
    items: [
      { href: "/dashboard/adobe", label: "Adobe Stock", hint: "Kit upload, hasil moderasi, kalibrasi", count: "adobe" },
      { href: "/dashboard/reels", label: "Reels", hint: "Kit posting Facebook dan reel terbit", count: "reels" },
    ],
  },
  {
    label: "Wawasan",
    items: [
      { href: "/dashboard/research", label: "Riset", hint: "Jadwal Rina, peluang, dan rollup" },
      { href: "/dashboard/performance", label: "Performa", hint: "Penjualan, tayangan, dan keyword" },
    ],
  },
];

export const NAV_ITEMS = NAV_GROUPS.flatMap((g) => g.items);

export function activeItem(pathname: string): NavItem {
  return (
    [...NAV_ITEMS].sort((a, b) => b.href.length - a.href.length).find((i) => pathname === i.href || pathname.startsWith(`${i.href}/`)) ??
    NAV_ITEMS[0]
  );
}
