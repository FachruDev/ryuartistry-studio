"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ThemeToggle } from "@/app/_components/theme-toggle";
import { activeItem, type NavCounts } from "./nav-config";
import { NavLinks, TeamCard, UserCard } from "./sidebar";
import { AccountMenu, NotificationsMenu, type TopbarNotification } from "./topbar-menus";

/** Two lines that rotate into an X; transform-only so it stays on the compositor. */
function MenuGlyph({ open }: { open: boolean }) {
  const line = "absolute left-1/2 h-px w-4 -translate-x-1/2 bg-current transition-transform duration-500 ease-fluid";
  return (
    <span aria-hidden="true" className="relative block h-4 w-4">
      <span className={`${line} top-[5px] ${open ? "translate-y-[3px] rotate-45" : ""}`} />
      <span className={`${line} top-[11px] ${open ? "-translate-y-[3px] -rotate-45" : ""}`} />
    </span>
  );
}

function MobileDrawer({ open, onClose, counts, user }: { open: boolean; onClose: () => void; counts?: NavCounts; user?: string }) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.querySelector<HTMLElement>("a,button")?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu navigasi">
      <button type="button" aria-label="Tutup menu" onClick={onClose} className="absolute inset-0 bg-bg/70 backdrop-blur-2xl" />
      <div
        ref={panelRef}
        className="rise absolute inset-x-3 top-3 bottom-3 flex flex-col gap-6 overflow-y-auto overscroll-contain rounded-[1.75rem] bg-core p-5 shadow-[var(--ambient)] ring-1 ring-hairline"
      >
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold tracking-tight" translate="no">
            Ryuartistry Studio
          </p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup menu"
            className="flex h-9 w-9 items-center justify-center rounded-full ring-1 ring-hairline transition-colors duration-500 ease-fluid hover:bg-shell focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <MenuGlyph open />
          </button>
        </div>
        <NavLinks counts={counts} onNavigate={onClose} stagger />
        <div className="mt-auto flex flex-col gap-3">
          <TeamCard />
          {user && <UserCard user={user} />}
        </div>
      </div>
    </div>
  );
}

/** Sticky glass bar floating above the content (not glued to the viewport edge). */
export function Topbar({
  counts,
  user,
  notifications = [],
  unread = 0,
}: {
  counts?: NavCounts;
  user?: string;
  notifications?: TopbarNotification[];
  unread?: number;
}) {
  const pathname = usePathname();
  const item = activeItem(pathname);
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const close = () => {
    setOpen(false);
    buttonRef.current?.focus();
  };

  return (
    <>
      <header className="sticky top-3 z-20 mx-3 mt-3 lg:ml-0">
        <div className="flex items-center gap-3 rounded-[1.25rem] bg-nav px-3 py-2.5 shadow-[var(--ambient)] ring-1 ring-hairline backdrop-blur-xl sm:px-4">
          <button
            ref={buttonRef}
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Buka menu"
            aria-expanded={open}
            className="flex h-9 w-9 items-center justify-center rounded-full ring-1 ring-hairline transition-colors duration-500 ease-fluid hover:bg-shell focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent lg:hidden"
          >
            <MenuGlyph open={open} />
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold tracking-tight">{item.label}</p>
            <p className="hidden truncate text-xs text-muted sm:block">{item.hint}</p>
          </div>
          {counts && counts.halted > 0 && (
            <a
              href="/dashboard#halted"
              className="hidden rounded-full bg-warn-soft px-3 py-1 text-xs font-medium text-warn transition-opacity duration-300 hover:opacity-80 sm:inline-flex"
            >
              {counts.halted} siklus berhenti
            </a>
          )}
          <div className="flex items-center gap-2">
            <NotificationsMenu items={notifications} unread={unread} />
            <ThemeToggle className="hidden sm:flex" />
            {user && <AccountMenu user={user} />}
          </div>
        </div>
      </header>
      <MobileDrawer open={open} onClose={close} counts={counts} user={user} />
    </>
  );
}
