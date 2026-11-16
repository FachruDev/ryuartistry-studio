"use client";

import { useActionState } from "react";
import {
  rotateTokenAction,
  runTickAction,
  saveSettingsAction,
  type SettingsState,
  type TickState,
  type TokenState,
} from "../automation/actions";
import { CopyText } from "./reels-forms";
import { btn, input } from "./ui";

export function RotateTokenForm({ agentId, name }: { agentId: string; name: string }) {
  const [state, action, pending] = useActionState<TokenState, FormData>(rotateTokenAction, null);
  return (
    <div className="flex flex-col gap-3">
      <form
        action={(fd) => {
          if (!window.confirm(`Ganti token ${name}? Token lama langsung berhenti bekerja; perbarui konfigurasi MCP di aplikasi agen.`)) return;
          action(fd);
        }}
      >
        <input type="hidden" name="agentId" value={agentId} />
        <button type="submit" disabled={pending} className={`${btn.plain} disabled:opacity-60`}>
          {pending ? "Membuat token…" : "Ganti Token"}
        </button>
      </form>
      <div aria-live="polite">
        {state?.error && <p className="text-sm text-danger">{state.error}</p>}
        {state?.token && (
          <div className="flex flex-col gap-2 rounded-2xl bg-warn-soft p-3">
            <p className="text-xs text-warn">Token baru {state.name}. Salin sekarang: token hanya ditampilkan sekali.</p>
            <CopyText text={state.token} label={`Token baru ${state.name}`} copyLabel="Salin token" rows={2} />
          </div>
        )}
      </div>
    </div>
  );
}

export function RunTickButton() {
  const [state, action, pending] = useActionState<TickState, FormData>(runTickAction, null);
  return (
    <form action={action} className="flex flex-col items-start gap-2">
      <button type="submit" disabled={pending} className={`${btn.plain} disabled:opacity-60`}>
        {pending ? "Memeriksa…" : "Jalankan Pengecekan Sekarang"}
      </button>
      <p aria-live="polite" className={`min-h-4 text-xs ${state?.error ? "text-danger" : "text-muted"}`}>
        {state?.error ?? state?.ok ?? ""}
      </p>
    </form>
  );
}

type Settings = {
  autoPublish: { adobe_stock: boolean; facebook_reels: boolean };
  budget: { dailyUsd: { adobe_stock: number | null; facebook_reels: number | null }; perJobUsd: number | null };
  staleQueueHours: number;
  agentQuietHours: number;
  webhookUrl: string | null;
};

const PLATFORMS = [
  { id: "adobe_stock", label: "Adobe Stock" },
  { id: "facebook_reels", label: "Facebook Reels" },
] as const;

function Field({ id, label, hint, children }: { id: string; label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      {children}
      {hint && <p className="text-xs text-subtle">{hint}</p>}
    </div>
  );
}

export function SettingsForm({ settings, ready }: { settings: Settings; ready: Record<string, boolean> }) {
  const [state, action, pending] = useActionState<SettingsState, FormData>(saveSettingsAction, null);
  const money = (v: number | null) => (v == null ? "" : String(v));
  return (
    <form action={action} className="flex flex-col gap-10">
      <fieldset className="flex flex-col gap-4">
        <legend className="mb-1 text-base font-semibold">Publikasi otomatis</legend>
        <p className="text-sm text-muted">
          Lewati approval manusia. Hanya berlaku saat syarat kalibrasi platform tercapai; kalau turun lagi, publikasi kembali butuh approval.
        </p>
        {PLATFORMS.map((p) => (
          <label key={p.id} className="flex cursor-pointer items-center justify-between gap-4 rounded-2xl bg-core-muted px-4 py-3 ring-1 ring-hairline">
            <span>
              <span className="block text-sm font-medium">{p.label}</span>
              <span className={`text-xs ${ready[p.id] ? "text-success" : "text-subtle"}`}>
                {ready[p.id] ? "Kalibrasi tercapai" : "Kalibrasi belum tercapai, sakelar belum berpengaruh"}
              </span>
            </span>
            <input type="checkbox" name={`auto_${p.id}`} defaultChecked={settings.autoPublish[p.id]} className="h-5 w-5 accent-[var(--accent)]" />
          </label>
        ))}
      </fieldset>

      <fieldset className="grid gap-5 sm:grid-cols-3">
        <legend className="mb-3 text-base font-semibold sm:col-span-3">Anggaran (USD)</legend>
        {PLATFORMS.map((p) => (
          <Field key={p.id} id={`daily_${p.id}`} label={`Harian ${p.label}`} hint="Kosongkan = tanpa batas">
            <input id={`daily_${p.id}`} name={`daily_${p.id}`} type="number" inputMode="decimal" min={0} step="0.01" autoComplete="off" defaultValue={money(settings.budget.dailyUsd[p.id])} placeholder="mis. 5…" className={input} />
          </Field>
        ))}
        <Field id="per_job" label="Per job" hint="Job yang melewati batas dihentikan">
          <input id="per_job" name="per_job" type="number" inputMode="decimal" min={0} step="0.01" autoComplete="off" defaultValue={money(settings.budget.perJobUsd)} placeholder="mis. 1…" className={input} />
        </Field>
      </fieldset>

      <fieldset className="grid gap-5 sm:grid-cols-2">
        <legend className="mb-3 text-base font-semibold sm:col-span-2">Pengawasan</legend>
        <Field id="stale_hours" label="Job dianggap macet setelah (jam)">
          <input id="stale_hours" name="stale_hours" type="number" inputMode="numeric" min={1} max={168} required autoComplete="off" defaultValue={settings.staleQueueHours} className={input} />
        </Field>
        <Field id="quiet_hours" label="Agen dianggap tidak aktif setelah (jam)">
          <input id="quiet_hours" name="quiet_hours" type="number" inputMode="numeric" min={1} max={168} required autoComplete="off" defaultValue={settings.agentQuietHours} className={input} />
        </Field>
        <div className="sm:col-span-2">
          <Field id="webhook" label="Webhook notifikasi (opsional)" hint="URL HTTPS Discord/Slack. Hanya peringatan dan notifikasi kritis yang dikirim.">
            <input id="webhook" name="webhook" type="url" inputMode="url" spellCheck={false} autoComplete="off" defaultValue={settings.webhookUrl ?? ""} placeholder="https://discord.com/api/webhooks/…" className={input} />
          </Field>
        </div>
      </fieldset>

      <div className="flex flex-wrap items-center gap-4">
        <button type="submit" disabled={pending} className={`${btn.primary} pr-5 disabled:opacity-60`}>
          {pending ? "Menyimpan…" : "Simpan Pengaturan"}
        </button>
        <p aria-live="polite" className={`text-sm ${state?.error ? "text-danger" : "text-success"}`}>
          {state?.error ?? state?.ok ?? ""}
        </p>
      </div>
    </form>
  );
}
