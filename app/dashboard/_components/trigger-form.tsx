"use client";

import { useActionState } from "react";
import { saveTriggerAction, type TriggerState } from "../agents/actions";
import { btn, input } from "./ui";

export type TriggerView = {
  url: string;
  times: string[];
  enabled: boolean;
  hasSecret: boolean;
} | null;

/** Webhook trigger for one agent: where to POST, how to sign, and at which WIB times. */
export function TriggerForm({ role, name, trigger, defaultTimes }: { role: string; name: string; trigger: TriggerView; defaultTimes: string }) {
  const [state, action, pending] = useActionState<TriggerState, FormData>(saveTriggerAction, null);
  const id = (k: string) => `trg-${role}-${k}`;
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="role" value={role} />
      <div className="flex flex-col gap-1.5">
        <label htmlFor={id("url")} className="text-xs text-subtle">
          URL pemicu (webhook Grok Automation, atau Fire URL routine Claude Code)
        </label>
        <input id={id("url")} name="url" type="url" required defaultValue={trigger?.url ?? ""} placeholder="https://…" autoComplete="off" spellCheck={false} className={input} />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={id("secret")} className="text-xs text-subtle">
          Secret / token {trigger?.hasSecret ? "(tersimpan; kosongkan untuk tetap memakai yang lama)" : "(Grok: whsec_…, routine Claude: sk-ant-oat01-…)"}
        </label>
        <input id={id("secret")} name="secret" type="password" defaultValue="" placeholder={trigger?.hasSecret ? "••••••••" : "whsec_… atau sk-ant-oat01-…"} autoComplete="off" spellCheck={false} className={input} />
        {trigger?.hasSecret && (
          <label className="flex items-center gap-2 text-xs text-muted">
            <input type="checkbox" name="clear_secret" className="h-3.5 w-3.5 accent-[var(--accent)]" /> Hapus secret tersimpan
          </label>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={id("times")} className="text-xs text-subtle">
          Jam jalan (WIB), pisahkan dengan koma
        </label>
        <input id={id("times")} name="times" required defaultValue={trigger?.times.join(", ") ?? defaultTimes} spellCheck={false} className={`${input} font-mono`} />
        <p className="text-xs text-subtle">Agen hanya dibangunkan bila ada pekerjaan. Cron tick harus berjalan tiap 15–30 menit.</p>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="enabled" defaultChecked={trigger?.enabled ?? true} className="h-4 w-4 accent-[var(--accent)]" /> Aktif
      </label>
      <div className="flex flex-wrap gap-2">
        <button type="submit" name="intent" value="save" disabled={pending} className={`${btn.plain} disabled:opacity-60`}>
          {pending ? "Menyimpan…" : "Simpan Pemicu"}
        </button>
        {trigger && (
          <>
            <button type="submit" name="intent" value="test" formNoValidate disabled={pending} className={`${btn.plain} disabled:opacity-60`}>
              Kirim Uji
            </button>
            <button
              type="submit"
              name="intent"
              value="delete"
              formNoValidate
              disabled={pending}
              onClick={(e) => {
                if (!window.confirm(`Hapus pemicu ${name}? Agen tidak akan dibangunkan studio lagi.`)) e.preventDefault();
              }}
              className={`${btn.plain} text-danger disabled:opacity-60`}
            >
              Hapus
            </button>
          </>
        )}
      </div>
      <p aria-live="polite" className={`min-h-4 text-xs ${state?.error ? "text-danger" : "text-muted"}`}>
        {state?.error ?? state?.ok ?? ""}
      </p>
    </form>
  );
}
