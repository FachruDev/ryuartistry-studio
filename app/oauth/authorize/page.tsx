import type { Metadata } from "next";
import { and, eq, ne } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { ThemeToggle } from "@/app/_components/theme-toggle";
import { IconCheck, IconX } from "@/app/dashboard/_components/icons";
import { ButtonIcon, btn } from "@/app/dashboard/_components/ui";
import { getSession } from "@/lib/auth/server";
import { db } from "@/lib/db";
import { agents } from "@/lib/db/schema";
import { checkAuthorizeRequest, type AuthorizeParams } from "@/lib/oauth/authorize";
import { publicOrigin } from "@/lib/oauth/http";
import { decideAuthorization } from "./actions";

export const metadata: Metadata = { title: "Izinkan akses · Ryuartistry Studio" };

const ROLE_HINT: Record<string, string> = {
  rina_scout: "Pindaian tren harian (mis. Grok): hanya mengirim pindaian, tidak menerbitkan laporan",
  rina: "Riset mendalam (mis. Claude): sesi riset, laporan harian, dan rollup",
  shion: "Ide & storyboard",
  lukas: "Review ide dan storyboard",
  linda: "Eksekusi: upload gambar dan reels",
  kechlyn: "Review akhir & metadata publikasi",
};

export default function AuthorizePage({ searchParams }: PageProps<"/oauth/authorize">) {
  return (
    <div className="flex min-h-[100dvh] flex-col">
      <div className="flex items-center justify-between px-5 pt-5 sm:px-8 sm:pt-7">
        <p className="text-sm font-semibold tracking-tight" translate="no">
          Ryuartistry Studio
        </p>
        <ThemeToggle />
      </div>
      <main className="mx-auto flex w-full max-w-xl flex-1 items-center px-5 py-10">
        <Suspense fallback={<p className="text-sm text-muted">Memeriksa permintaan…</p>}>
          <Consent searchParams={searchParams} />
        </Suspense>
      </main>
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="rise w-full rounded-[2rem] bg-shell p-2 ring-1 ring-hairline">
      <div className="rounded-[calc(2rem-0.5rem)] bg-core p-7 shadow-[inset_0_1px_0_var(--highlight),var(--ambient)] sm:p-9">{children}</div>
    </div>
  );
}

async function Consent({ searchParams }: { searchParams: PageProps<"/oauth/authorize">["searchParams"] }) {
  await connection();
  const raw = await searchParams;
  const params = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])) as AuthorizeParams;
  const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v) as [string, string][]).toString();

  const session = await getSession();
  if (!session) redirect(`/login?next=${encodeURIComponent(`/oauth/authorize?${qs}`)}`);

  const origin = publicOrigin(await headers());
  const check = await checkAuthorizeRequest(params, origin);
  if (check.kind === "redirect-error") redirect(check.url);
  if (check.kind === "fatal") {
    return (
      <Card>
        <h1 className="text-2xl font-semibold tracking-tight">Permintaan tidak valid</h1>
        <p role="alert" className="mt-3 text-sm text-danger">
          {check.message}
        </p>
        <p className="mt-3 text-sm text-muted">Hapus konektor di aplikasi AI lalu tambahkan lagi dengan URL MCP studio.</p>
      </Card>
    );
  }

  const team = await db.select().from(agents).where(and(eq(agents.active, true), ne(agents.role, "admin"))).orderBy(agents.createdAt);
  const redirectHost = new URL(check.redirectUri).host;

  return (
    <Card>
      <span className="inline-flex rounded-full bg-shell px-3 py-1 text-[10px] font-medium uppercase tracking-[0.2em] text-muted ring-1 ring-hairline">
        Izinkan akses MCP
      </span>
      <h1 className="mt-5 text-balance text-3xl font-semibold tracking-tight">
        <span className="text-accent">{check.client.name}</span> ingin terhubung ke studio
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-muted">
        Aplikasi ini akan memanggil tools studio <strong className="text-text">sebagai agen yang kamu pilih</strong>, dan hanya bisa memakai tools milik
        agen itu. Token berlaku 1 jam dan diperbarui otomatis; kamu bisa mencabutnya kapan saja di halaman Agen.
      </p>
      <dl className="mt-5 grid gap-2 rounded-2xl bg-core-muted p-4 text-xs ring-1 ring-hairline">
        <div className="flex justify-between gap-4">
          <dt className="text-subtle">Kembali ke</dt>
          <dd className="truncate font-mono" translate="no">
            {redirectHost}
          </dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-subtle">Masuk sebagai</dt>
          <dd>{session.user}</dd>
        </div>
      </dl>

      <form action={decideAuthorization} className="mt-7 flex flex-col gap-5">
        {Object.entries(params).map(([k, v]) => (v ? <input key={k} type="hidden" name={k} value={v} /> : null))}
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm font-medium">Hubungkan sebagai agen</legend>
          {team.map((a, i) => (
            <label key={a.id} className="flex cursor-pointer items-center gap-3 rounded-2xl px-4 py-3 ring-1 ring-hairline transition-colors duration-300 hover:bg-shell has-[:checked]:bg-accent-soft has-[:checked]:ring-accent">
              <input type="radio" name="agentId" value={a.id} required defaultChecked={i === 0} className="h-4 w-4 accent-[var(--accent)]" />
              <span className="min-w-0">
                <span className="block text-sm font-medium" translate="no">
                  {a.name}
                </span>
                <span className="block text-xs text-muted">{ROLE_HINT[a.role] ?? a.role}</span>
              </span>
            </label>
          ))}
        </fieldset>
        <div className="flex flex-wrap gap-2">
          <button name="decision" value="approve" className={btn.primary}>
            Izinkan
            <ButtonIcon inverted>
              <IconCheck />
            </ButtonIcon>
          </button>
          <button name="decision" value="deny" formNoValidate className={btn.ghost}>
            Tolak
            <ButtonIcon>
              <IconX />
            </ButtonIcon>
          </button>
        </div>
      </form>
    </Card>
  );
}
