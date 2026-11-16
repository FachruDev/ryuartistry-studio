import { connection } from "next/server";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getSession } from "@/lib/auth/server";
import { getUserById } from "@/lib/auth/users";
import { PasswordForm } from "../_components/password-form";
import { Badge, PageHeader, Panel, Section, fmtDate } from "../_components/ui";

export const metadata = { title: "Akun · Ryuartistry Studio" };

export default function AccountPage() {
  return (
    <>
      <PageHeader eyebrow="Akun" title="Akun & keamanan" description="Kata sandi disimpan sebagai hash di database. Mengganti kata sandi mengeluarkan semua sesi lain." />
      <Suspense fallback={<p className="text-sm text-muted">Memuat akun…</p>}>
        <AccountData />
      </Suspense>
    </>
  );
}

async function AccountData() {
  await connection();
  const session = await getSession();
  if (!session) redirect("/login?next=/dashboard/account");
  const user = await getUserById(session.uid);
  if (!user) redirect("/login");

  return (
    <div className="flex flex-col gap-16">
      <Section eyebrow="Profil" title={user.username} aside={<Badge tone="accent">{user.role}</Badge>} delay={60}>
        <Panel coreClassName="grid gap-4 p-6 text-sm sm:grid-cols-3">
          <div>
            <p className="text-xs text-subtle">Login terakhir</p>
            <p className="mt-1">{user.lastLoginAt ? fmtDate(user.lastLoginAt) : "–"}</p>
          </div>
          <div>
            <p className="text-xs text-subtle">Kata sandi diganti</p>
            <p className="mt-1">{user.passwordChangedAt ? fmtDate(user.passwordChangedAt) : "belum pernah"}</p>
          </div>
          <div>
            <p className="text-xs text-subtle">Akun dibuat</p>
            <p className="mt-1">{fmtDate(user.createdAt)}</p>
          </div>
        </Panel>
      </Section>
      <Section eyebrow="Keamanan" title="Ganti kata sandi" delay={120}>
        <Panel coreClassName="p-6 sm:p-8">
          <PasswordForm username={user.username} />
        </Panel>
      </Section>
    </div>
  );
}
