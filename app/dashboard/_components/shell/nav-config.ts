export type NavCounts = { approvals: number; adobe: number; reels: number; halted: number; quietAgents?: number };

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
    items: [
      { href: "/dashboard", label: "Ringkasan", hint: "Keputusan dan status hari ini", count: "approvals" },
      { href: "/dashboard/flow", label: "Alur harian", hint: "Riset sampai terbit, per hari dan per bulan" },
      { href: "/dashboard/outputs", label: "Hasil kerja", hint: "Output tiap agen, satu per satu atau sekaligus" },
    ],
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
  {
    label: "Otomasi",
    items: [
      { href: "/dashboard/agents", label: "Agen", hint: "Status, jadwal, dan kit koneksi MCP", count: "quietAgents" },
      { href: "/dashboard/automation", label: "Pengaturan", hint: "Anggaran, publikasi otomatis, notifikasi" },
    ],
  },
];

export const NAV_ITEMS = NAV_GROUPS.flatMap((g) => g.items);

/** Pages reachable from the account menu rather than the sidebar. */
const EXTRA_PAGES: NavItem[] = [{ href: "/dashboard/account", label: "Akun", hint: "Kata sandi dan keamanan" }];

export function activeItem(pathname: string): NavItem {
  const extra = EXTRA_PAGES.find((p) => pathname.startsWith(p.href));
  if (extra) return extra;
  return (
    [...NAV_ITEMS].sort((a, b) => b.href.length - a.href.length).find((i) => pathname === i.href || pathname.startsWith(`${i.href}/`)) ??
    NAV_ITEMS[0]
  );
}
