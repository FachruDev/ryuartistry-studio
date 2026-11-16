/**
 * Studio UI primitives. Colours come only from theme tokens (app/globals.css), so every
 * component works in both light and dark themes.
 */
import type { CSSProperties, ReactNode } from "react";

const fluid = "duration-500 ease-fluid";

export function PageHeader({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <header className="rise mb-12 flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
      <div className="max-w-2xl">
        <Eyebrow>{eyebrow}</Eyebrow>
        <h1 className="mt-4 text-4xl font-semibold tracking-[-0.03em] sm:text-5xl">{title}</h1>
        {description && <p className="mt-3 text-base leading-relaxed text-muted">{description}</p>}
      </div>
      {children}
    </header>
  );
}

export function Eyebrow({ children, tone = "neutral" }: { children: ReactNode; tone?: Tone }) {
  return (
    <span
      className={`inline-flex rounded-full px-3 py-1 text-[10px] font-medium uppercase tracking-[0.2em] ring-1 ring-hairline ${TONE[tone]}`}
    >
      {children}
    </span>
  );
}

export function Section({
  eyebrow,
  title,
  aside,
  children,
  delay = 0,
}: {
  eyebrow?: string;
  title: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
  delay?: number;
}) {
  return (
    <section className="rise" style={{ animationDelay: `${delay}ms` } as CSSProperties}>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          {eyebrow && <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.2em] text-subtle">{eyebrow}</p>}
          <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
        </div>
        {aside}
      </div>
      {children}
    </section>
  );
}

/** Double-bezel container: a hairline tray (shell) holding a raised core. */
export function Panel({
  children,
  className = "",
  coreClassName = "",
}: {
  children: ReactNode;
  className?: string;
  coreClassName?: string;
}) {
  return (
    <div className={`rounded-[1.75rem] bg-shell p-1.5 ring-1 ring-hairline ${className}`}>
      <div
        className={`h-full rounded-[calc(1.75rem-0.375rem)] bg-core shadow-[inset_0_1px_0_var(--highlight),var(--ambient)] ${coreClassName}`}
      >
        {children}
      </div>
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <Panel coreClassName="px-6 py-10 text-center text-sm text-muted">
      <p>{children}</p>
    </Panel>
  );
}

export type Tone = "neutral" | "accent" | "success" | "warn" | "danger";

const TONE: Record<Tone, string> = {
  neutral: "bg-shell text-muted",
  accent: "bg-accent-soft text-accent",
  success: "bg-success-soft text-success",
  warn: "bg-warn-soft text-warn",
  danger: "bg-danger-soft text-danger",
};

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: Tone }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${TONE[tone]}`}>
      {children}
    </span>
  );
}

/** Pill button classes. Pair with <ButtonIcon> for the nested trailing icon. */
export const btn = {
  primary: `group inline-flex items-center gap-2 rounded-full bg-text py-1.5 pl-5 pr-1.5 text-sm font-medium text-bg transition-[transform,opacity] ${fluid} hover:opacity-90 active:scale-[0.98]`,
  ghost: `group inline-flex items-center gap-2 rounded-full py-1.5 pl-5 pr-1.5 text-sm font-medium text-text ring-1 ring-hairline transition-[transform,background-color] ${fluid} hover:bg-shell active:scale-[0.98]`,
  plain: `inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium text-muted ring-1 ring-hairline transition-[transform,background-color,color] ${fluid} hover:bg-shell hover:text-text active:scale-[0.98]`,
};

export function ButtonIcon({ children, inverted = false }: { children: ReactNode; inverted?: boolean }) {
  return (
    <span
      className={`flex h-7 w-7 items-center justify-center rounded-full transition-transform ${fluid} group-hover:-translate-y-px group-hover:translate-x-0.5 group-hover:scale-105 ${
        inverted ? "bg-bg/15" : "bg-shell ring-1 ring-hairline"
      }`}
    >
      {children}
    </span>
  );
}

export const input = `w-full rounded-2xl bg-core-muted px-4 py-2.5 text-sm text-text ring-1 ring-hairline placeholder:text-subtle transition-shadow ${fluid} focus:outline-none focus:ring-2 focus:ring-accent`;

export const table = {
  head: "text-left text-[11px] uppercase tracking-[0.14em] text-subtle",
  th: "px-5 py-3 font-medium",
  row: "border-t border-hairline transition-colors duration-300 hover:bg-core-muted",
  td: "px-5 py-3",
};

export function Stat({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: Tone;
}) {
  return (
    <Panel coreClassName="flex h-full flex-col justify-between gap-6 p-5">
      <p className="text-sm text-muted">{label}</p>
      <div>
        <p className="text-3xl font-semibold tracking-tight">{value}</p>
        {hint && <div className="mt-2">{typeof hint === "string" ? <Badge tone={tone}>{hint}</Badge> : hint}</div>}
      </div>
    </Panel>
  );
}

export function pct(x: number | null): string {
  return x == null ? "–" : `${Math.round(x * 100)}%`;
}

export function usd(x: number): string {
  return `$${x.toFixed(2)}`;
}
