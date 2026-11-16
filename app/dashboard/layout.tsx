import { connection } from "next/server";
import { Suspense } from "react";
import { getSession } from "@/lib/auth/server";
import { navCounts } from "@/lib/studio/service";
import { Sidebar } from "./_components/shell/sidebar";
import { Topbar } from "./_components/shell/topbar";

/** Sidebar + topbar with live counters; both render without data first, then stream in. */
async function Chrome() {
  await connection();
  const [session, counts] = await Promise.all([getSession(), navCounts()]);
  return (
    <>
      <Sidebar counts={counts} user={session?.user} />
      <Topbar counts={counts} user={session?.user} />
    </>
  );
}

export default function DashboardLayout({ children }: LayoutProps<"/dashboard">) {
  return (
    <div className="min-h-[100dvh] lg:pl-[280px]">
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
