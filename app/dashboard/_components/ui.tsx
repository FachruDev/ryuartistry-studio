import type { ReactNode } from "react";

export function Section({ title, children, tone }: { title: ReactNode; children: ReactNode; tone?: "warn" }) {
  return (
    <section>
      <h2 className={`mb-3 text-lg font-medium ${tone === "warn" ? "text-amber-600" : ""}`}>{title}</h2>
      {children}
    </section>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="text-sm text-zinc-500">{children}</p>;
}

export const tableWrap = "overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800";
export const thead = "bg-zinc-50 text-left text-zinc-500 dark:bg-zinc-900";
export const row = "border-t border-zinc-100 dark:border-zinc-800";
export const card = "flex flex-col gap-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800";
export const input = "rounded border border-zinc-300 bg-transparent p-2 text-sm dark:border-zinc-700";
export const primaryBtn = "rounded bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700";
export const secondaryBtn =
  "rounded border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900";

export function pct(x: number | null): string {
  return x == null ? "-" : `${Math.round(x * 100)}%`;
}
