"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { logoutAction } from "@/app/login/actions";
import { NAV_GROUPS, activeItem, type NavCounts } from "./nav-config";
import { IconChevron, IconLogout, NAV_ICONS } from "./nav-icons";

const TEAM = [
  { name: "Rina-Scout", role: "Tren" },
  { name: "Rina", role: "Riset" },
  { name: "Shion", role: "Ide" },
  { name: "Lukas", role: "Saring ide" },
  { name: "Linda", role: "Eksekusi" },
  { name: "Kechlyn", role: "Keputusan" },
];

const focusRing = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent";

/** Nav list shared by the desktop sidebar and the mobile drawer. `sb-*` classes collapse it into a rail. */
export function NavLinks({ counts, onNavigate, stagger = false }: { counts?: NavCounts; onNavigate?: () => void; stagger?: boolean }) {
  const pathname = usePathname();
  const active = activeItem(pathname);
  let index = 0;
  return (
    <nav aria-label="Navigasi utama" className="flex flex-col gap-6">
      {NAV_GROUPS.map((group) => (
        <div key={group.label}>
          <p className="sb-hide mb-2 px-3 text-[10px] font-medium uppercase tracking-[0.2em] text-subtle">{group.label}</p>
          <ul className="flex flex-col gap-0.5">
            {group.items.map((item) => {
              const Icon = NAV_ICONS[item.href];
              const isActive = item.href === active.href;
              const n = (item.count && counts?.[item.count]) || 0;
              const delay = stagger ? { animationDelay: `${80 + index++ * 50}ms` } : undefined;
              return (
                <li key={item.href} className={stagger ? "rise" : undefined} style={delay}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    title={item.label}
                    aria-current={isActive ? "page" : undefined}
                    className={`sb-center relative flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm transition-[background-color,color] duration-500 ease-fluid ${focusRing} ${
                      isActive ? "bg-core text-text shadow-[inset_0_1px_0_var(--highlight),var(--ambient)] ring-1 ring-hairline" : "text-muted hover:bg-shell hover:text-text"
                    }`}
                  >
                    <Icon className={`shrink-0 transition-colors duration-500 ease-fluid ${isActive ? "text-accent" : ""}`} />
                    <span className="sb-label min-w-0 flex-1 truncate">{item.label}</span>
                    {n > 0 && (
                      <>
                        <span className="sb-hide rounded-full bg-accent-soft px-2 py-0.5 font-mono text-[11px] tabular-nums text-accent" aria-label={`${n} menunggu`}>
                          {n}
                        </span>
                        {/* Rail mode: a dot instead of the number. */}
                        <span aria-hidden="true" className="sb-dot absolute right-2 top-2 h-2 w-2 rounded-full bg-accent" />
                      </>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

export function TeamCard() {
  return (
    <div className="sb-hide rounded-2xl bg-shell p-3 ring-1 ring-hairline">
      <p className="mb-2 px-1 text-[10px] font-medium uppercase tracking-[0.2em] text-subtle">Tim agen</p>
      <ul className="flex flex-col gap-1.5">
        {TEAM.map((a) => (
          <li key={a.name} className="flex items-center gap-2 px-1 text-xs">
            <span aria-hidden="true" className="flex h-5 w-5 items-center justify-center rounded-full bg-core text-[10px] font-semibold ring-1 ring-hairline">
              {a.name[0]}
            </span>
            <span className="font-medium" translate="no">
              {a.name}
            </span>
            <span className="ml-auto text-subtle">{a.role}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function UserCard({ user }: { user: string }) {
  return (
    <div className="sb-stack sb-center flex items-center gap-3 rounded-2xl px-2 py-1.5">
      <span aria-hidden="true" title={user} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-text text-xs font-semibold uppercase text-bg">
        {user.slice(0, 1)}
      </span>
      <div className="sb-hide min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{user}</p>
        <p className="text-xs text-subtle">Operator</p>
      </div>
      <form action={logoutAction}>
        <button
          type="submit"
          aria-label="Keluar"
          title="Keluar"
          className={`flex h-8 w-8 items-center justify-center rounded-full text-muted ring-1 ring-hairline transition-[color,background-color,transform] duration-500 ease-fluid hover:bg-shell hover:text-danger active:scale-[0.94] ${focusRing}`}
        >
          <IconLogout />
        </button>
      </form>
    </div>
  );
}

function toggleSidebar() {
  const root = document.documentElement;
  const collapsed = root.getAttribute("data-sidebar") === "collapsed";
  if (collapsed) root.removeAttribute("data-sidebar");
  else root.setAttribute("data-sidebar", "collapsed");
  try {
    localStorage.setItem("studio-sidebar", collapsed ? "expanded" : "collapsed");
  } catch {
    // Storage blocked: the change still applies to this page view.
  }
}

/** Desktop sidebar: a floating double-bezel panel that can collapse into an icon rail. */
export function Sidebar({ counts, user }: { counts?: NavCounts; user?: string }) {
  return (
    <aside className="shell-sidebar fixed inset-y-3 left-3 z-30 hidden lg:block" aria-label="Sidebar">
      <div className="h-full rounded-[1.75rem] bg-shell p-1.5 ring-1 ring-hairline">
        <div className="flex h-full flex-col gap-6 overflow-y-auto overscroll-contain rounded-[calc(1.75rem-0.375rem)] bg-core-muted p-3 shadow-[inset_0_1px_0_var(--highlight)]">
          <div className="sb-stack flex items-center gap-2">
            <Link href="/dashboard" title="Ryuartistry Studio" className={`sb-center flex min-w-0 flex-1 items-center gap-3 rounded-2xl px-2 py-1 ${focusRing}`}>
              <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-text text-sm font-semibold text-bg">
                R
              </span>
              <span className="sb-label leading-tight">
                <span className="block text-sm font-semibold tracking-tight" translate="no">
                  Ryuartistry
                </span>
                <span className="block text-xs text-subtle">Studio konten AI</span>
              </span>
            </Link>
            <button
              type="button"
              onClick={toggleSidebar}
              aria-label="Ciutkan atau lebarkan sidebar"
              title="Ciutkan / lebarkan"
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted ring-1 ring-hairline transition-[color,background-color] duration-500 ease-fluid hover:bg-shell hover:text-text ${focusRing}`}
            >
              <IconChevron className="sb-collapse-icon transition-transform duration-500 ease-fluid" />
            </button>
          </div>
          <NavLinks counts={counts} />
          <div className="mt-auto flex flex-col gap-3">
            <TeamCard />
            {user && <UserCard user={user} />}
          </div>
        </div>
      </div>
    </aside>
  );
}
