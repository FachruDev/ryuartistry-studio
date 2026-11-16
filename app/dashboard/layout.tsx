import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { getSession } from "@/lib/auth/server";
import { agentsOverview, listNotifications, navCounts, unreadNotificationCount } from "@/lib/studio/service";
import { Sidebar } from "./_components/shell/sidebar";
import { Topbar } from "./_components/shell/topbar";

/** Sidebar + topbar with live counters; both render without data first, then stream in. */
async function Chrome() {
  await connection();
  const [session, base, agents, notes, unread] = await Promise.all([
    getSession(),
    navCounts(),
    agentsOverview(),
    listNotifications(8),
    unreadNotificationCount(),
  ]);
  // The proxy only checks the cookie signature; a revoked or outdated session ends here.
  if (!session) redirect("/login");
  const counts = { ...base, quietAgents: agents.filter((a) => a.role !== "admin" && a.health !== "active").length };
  // Plain JSON for the client menus (dates as ISO strings).
  const notifications = notes.map((n) => ({
    id: n.id,
    severity: n.severity,
    title: n.title,
    body: n.body,
    href: n.href,
    readAt: n.readAt?.toISOString() ?? null,
    createdAt: n.createdAt.toISOString(),
  }));
  return (
    <>
      <Sidebar counts={counts} user={session.user} />
      <Topbar counts={counts} user={session.user} notifications={notifications} unread={unread} />
      {session.mustChangePassword && (
        <div className="mx-3 mt-3 lg:ml-0">
          <p role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-warn-soft px-4 py-3 text-sm text-warn">
            Kamu masih memakai kata sandi awal.
            <Link href="/dashboard/account" className="font-medium underline underline-offset-4">
              Ganti kata sandi
            </Link>
          </p>
        </div>
      )}
    </>
  );
}

export default function DashboardLayout({ children }: LayoutProps<"/dashboard">) {
  return (
    <div className="shell-content min-h-[100dvh]">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-text focus:px-4 focus:py-2 focus:text-sm focus:text-bg"
      >
        Lewati ke konten
      </a>
      <Suspense
        fallback={
          <>
            <Sidebar />
            <Topbar />
          </>
        }
      >
        <Chrome />
      </Suspense>
      <main id="main" tabIndex={-1} className="mx-auto w-full max-w-6xl px-4 pb-24 pt-10 focus:outline-none sm:px-8 lg:pt-12">
        {children}
      </main>
    </div>
  );
}
