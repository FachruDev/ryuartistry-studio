import type { Metadata } from "next";
import { ThemeToggle } from "@/app/_components/theme-toggle";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Masuk · Ryuartistry Studio" };

const TEAM = [
  { name: "Rina", role: "Riset pasar" },
  { name: "Shion", role: "Ide & skenario" },
  { name: "Lukas", role: "Penyaring ide" },
  { name: "Linda", role: "Eksekusi" },
  { name: "Kechlyn", role: "Keputusan akhir" },
];

export default function LoginPage() {
  return (
    <div className="relative flex min-h-[100dvh] flex-col">
      <div className="flex items-center justify-between px-5 pt-5 sm:px-8 sm:pt-7">
        <p className="text-sm font-semibold tracking-tight" translate="no">
          Ryuartistry Studio
        </p>
        <ThemeToggle />
      </div>

      <main className="mx-auto grid w-full max-w-6xl flex-1 items-center gap-12 px-5 py-10 sm:px-8 lg:grid-cols-12 lg:gap-16 lg:py-16">
        <section className="rise lg:col-span-7" aria-labelledby="login-title">
          <span className="inline-flex rounded-full bg-shell px-3 py-1 text-[10px] font-medium uppercase tracking-[0.2em] text-muted ring-1 ring-hairline">
            Panel operator
          </span>
          <h1 id="login-title" className="mt-6 text-balance text-5xl font-semibold leading-[1.02] tracking-[-0.04em] sm:text-6xl lg:text-7xl">
            Lima agen bekerja.
            <span className="block text-muted">Kamu yang memutuskan.</span>
          </h1>
          <p className="mt-6 max-w-lg text-pretty text-base leading-relaxed text-muted">
            Riset, ide, review, produksi, sampai siap publikasi untuk Adobe Stock dan Facebook Reels. Masuk untuk
            menyetujui hasil, mengunggah kit, dan membaca performa.
          </p>
          <ul className="mt-10 flex flex-wrap gap-2" aria-label="Tim agen">
            {TEAM.map((a, i) => (
              <li
                key={a.name}
                className="rise flex items-center gap-2 rounded-full bg-shell py-1.5 pl-1.5 pr-4 ring-1 ring-hairline"
                style={{ animationDelay: `${200 + i * 70}ms` }}
              >
                <span
                  aria-hidden="true"
                  className="flex h-7 w-7 items-center justify-center rounded-full bg-core text-xs font-semibold ring-1 ring-hairline"
                >
                  {a.name[0]}
                </span>
                <span className="text-sm">
                  <span className="font-medium" translate="no">
                    {a.name}
                  </span>
                  <span className="text-muted"> · {a.role}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="rise lg:col-span-5" style={{ animationDelay: "120ms" }} aria-label="Formulir masuk">
          <div className="rounded-[2rem] bg-shell p-2 ring-1 ring-hairline">
            <div className="rounded-[calc(2rem-0.5rem)] bg-core p-7 shadow-[inset_0_1px_0_var(--highlight),var(--ambient)] sm:p-9">
              <h2 className="text-2xl font-semibold tracking-tight">Masuk</h2>
              <p className="mt-1.5 text-sm text-muted">Gunakan akun operator dari pengaturan server.</p>
              <div className="mt-8">
                <LoginForm />
              </div>
            </div>
          </div>
          <p className="mt-4 px-2 text-xs text-subtle">
            Sesi berlaku 7 hari. Lima kali salah memasukkan kata sandi mengunci percobaan selama 15 menit.
          </p>
        </section>
      </main>
    </div>
  );
}

