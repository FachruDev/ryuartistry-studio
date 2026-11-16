"use client";

import Link from "next/link";
import { useTransition } from "react";
import { toggleTheme } from "@/app/_components/theme-toggle";
import { logoutAction } from "@/app/login/actions";
import { IconMoon, IconSun } from "../icons";
import { markNotificationsReadAction } from "../../actions";
import { Dropdown, menuItem } from "./dropdown";
import { IconBell, IconKey, IconLogout, NAV_ICONS } from "./nav-icons";

export type TopbarNotification = {
  id: string;
  severity: "info" | "warn" | "critical";
  title: string;
  body: string;
  href: string | null;
  readAt: string | null;
  createdAt: string;
};

const DOT = { info: "bg-accent", warn: "bg-warn", critical: "bg-danger" } as const;
const SEVERITY_LABEL = { info: "Info", warn: "Peringatan", critical: "Kritis" } as const;
const RELATIVE = new Intl.RelativeTimeFormat("id-ID", { numeric: "auto" });

function ago(iso: string): string {
  const mins = Math.round((Date.parse(iso) - Date.now()) / 60000);
  if (Math.abs(mins) < 60) return RELATIVE.format(mins, "minute");
  const hours = Math.round(mins / 60);
  if (Math.abs(hours) < 24) return RELATIVE.format(hours, "hour");
  return RELATIVE.format(Math.round(hours / 24), "day");
}

export function NotificationsMenu({ items, unread }: { items: TopbarNotification[]; unread: number }) {
  const [pending, start] = useTransition();
  return (
    <Dropdown
      label={unread ? `Notifikasi, ${unread} belum dibaca` : "Notifikasi"}
      triggerClassName="w-9 text-muted hover:text-text"
      width="w-[22rem]"
      trigger={
        <>
          <IconBell />
          {unread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 font-mono text-[10px] leading-none text-white">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </>
      }
    >
      {(close) => (
        <div>
          <div className="flex items-center justify-between border-b border-hairline px-4 py-3">
            <p className="text-sm font-semibold">Notifikasi</p>
            <button
              type="button"
              data-menu-item
              role="menuitem"
              disabled={!unread || pending}
              onClick={() => start(() => markNotificationsReadAction())}
              className="rounded-full px-2 py-1 text-xs text-muted transition-colors hover:bg-shell hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-40"
            >
              {pending ? "Menandai…" : "Tandai semua dibaca"}
            </button>
          </div>
          {items.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted">Belum ada notifikasi. Pengecekan otomatis berjalan lewat cron.</p>
          ) : (
            <ul>
              {items.map((n) => (
                <li key={n.id} className="border-b border-hairline last:border-0">
                  <Link href={n.href ?? "/dashboard/automation"} role="menuitem" data-menu-item onClick={close} className={`${menuItem} items-start`}>
                    <span aria-hidden="true" className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${DOT[n.severity]} ${n.readAt ? "opacity-30" : ""}`} />
                    <span className="min-w-0 flex-1">
                      <span className="sr-only">{SEVERITY_LABEL[n.severity]}: </span>
                      <span className={`block truncate ${n.readAt ? "text-muted" : "font-medium"}`}>{n.title}</span>
                      <span className="mt-0.5 line-clamp-2 block text-xs text-muted">{n.body}</span>
                      <span className="mt-1 block text-[11px] text-subtle">{ago(n.createdAt)}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <Link href="/dashboard/automation#notifikasi" role="menuitem" data-menu-item onClick={close} className={`${menuItem} justify-center border-t border-hairline text-muted`}>
            Lihat semua notifikasi
          </Link>
        </div>
      )}
    </Dropdown>
  );
}

export function AccountMenu({ user }: { user: string }) {
  const AgentsIcon = NAV_ICONS["/dashboard/agents"];
  const SettingsIcon = NAV_ICONS["/dashboard/automation"];
  return (
    <Dropdown
      label={`Menu akun ${user}`}
      width="w-60"
      triggerClassName="gap-2 pl-1 pr-3"
      trigger={
        <>
          <span aria-hidden="true" className="flex h-7 w-7 items-center justify-center rounded-full bg-text text-xs font-semibold uppercase text-bg">
            {user.slice(0, 1)}
          </span>
          <span className="hidden max-w-24 truncate text-sm sm:inline">{user}</span>
        </>
      }
    >
      {(close) => (
        <div className="py-1">
          <div className="border-b border-hairline px-4 py-3">
            <p className="truncate text-sm font-semibold">{user}</p>
            <p className="text-xs text-subtle">Operator studio</p>
          </div>
          <Link href="/dashboard/agents" role="menuitem" data-menu-item onClick={close} className={menuItem}>
            <AgentsIcon className="text-muted" /> Agen & koneksi
          </Link>
          <Link href="/dashboard/automation" role="menuitem" data-menu-item onClick={close} className={menuItem}>
            <SettingsIcon className="text-muted" /> Pengaturan otomasi
          </Link>
          <Link href="/dashboard/account" role="menuitem" data-menu-item onClick={close} className={menuItem}>
            <IconKey className="text-muted" /> Akun & kata sandi
          </Link>
          <button type="button" role="menuitem" data-menu-item onClick={() => toggleTheme()} className={menuItem}>
            <IconSun className="theme-icon-sun text-muted" />
            <IconMoon className="theme-icon-moon text-muted" />
            Ganti tema
          </button>
          <form action={logoutAction} className="border-t border-hairline">
            <button type="submit" role="menuitem" data-menu-item className={`${menuItem} text-danger`}>
              <IconLogout /> Keluar
            </button>
          </form>
        </div>
      )}
    </Dropdown>
  );
}
