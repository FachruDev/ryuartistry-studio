"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconMoon, IconSun } from "./icons";

const LINKS = [
  { href: "/dashboard", label: "Ringkasan" },
  { href: "/dashboard/research", label: "Riset" },
  { href: "/dashboard/performance", label: "Performa" },
];

function toggleTheme() {
  const root = document.documentElement;
  const next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
  root.setAttribute("data-theme", next);
  try {
    localStorage.setItem("studio-theme", next);
  } catch {
    // Private mode or blocked storage: the switch still works for this page view.
  }
}

/** Floating glass pill: sticky, detached from the top edge. */
export function StudioNav() {
  const pathname = usePathname();
  return (
    <div className="sticky top-4 z-20 flex justify-center px-4 pt-4">
      <nav
        aria-label="Navigasi studio"
        className="flex items-center gap-1 rounded-full bg-nav p-1.5 shadow-[var(--ambient)] ring-1 ring-hairline backdrop-blur-xl"
      >
        <span className="hidden px-3 text-sm font-semibold tracking-tight sm:inline">Ryuartistry</span>
        {LINKS.map((l) => {
          const active = l.href === "/dashboard" ? pathname === l.href : pathname.startsWith(l.href);
          return (
            <Link
              key={l.href}
              href={l.href}
              aria-current={active ? "page" : undefined}
              className={`rounded-full px-3.5 py-1.5 text-sm transition-colors duration-500 ease-fluid ${
                active ? "bg-text text-bg" : "text-muted hover:bg-shell hover:text-text"
              }`}
            >
              {l.label}
            </Link>
          );
        })}
        <button
          type="button"
          onClick={toggleTheme}
          aria-label="Ganti tema terang/gelap"
          title="Ganti tema"
          className="ml-1 flex h-8 w-8 items-center justify-center rounded-full text-muted ring-1 ring-hairline transition-[transform,color] duration-500 ease-fluid hover:text-text active:scale-[0.94]"
        >
          <IconSun className="theme-icon-sun" />
          <IconMoon className="theme-icon-moon" />
        </button>
      </nav>
    </div>
  );
}
