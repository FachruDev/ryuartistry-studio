"use client";

import { useActionState } from "react";
import { importPerformanceAction, type ImportState } from "../performance/actions";
import { IconUpload } from "./icons";
import { Badge, ButtonIcon, btn, input } from "./ui";

export function PerformanceImport({ platform }: { platform: "adobe_stock" | "facebook_reels" }) {
  const [state, action, pending] = useActionState<ImportState, FormData>(importPerformanceAction, null);
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="platform" value={platform} />
      <p className="text-sm text-muted">
        {platform === "facebook_reels"
          ? "Unggah atau tempel ekspor performa dari Meta. Kolom yang dikenali: link postingan (permalink / post url), tanggal (date / publish time), views, dan estimated earnings. "
          : "Unggah atau tempel CSV penjualan Adobe. Kolom yang dikenali: nama file (filename / original filename), tanggal (date / sale date), downloads, dan revenue (earnings / royalty). "}
        Impor ulang hari yang sama akan menimpa, bukan menggandakan.
      </p>
      <label className="flex flex-col gap-2 text-sm">
        <span className="text-muted">File CSV</span>
        <input type="file" name="file" accept=".csv,text/csv" className={`${input} file:mr-3 file:rounded-full file:border-0 file:bg-shell file:px-3 file:py-1 file:text-text`} />
      </label>
      <label className="flex flex-col gap-2 text-sm">
        <span className="text-muted">atau tempel isinya</span>
        <textarea name="csv" rows={4} autoComplete="off" spellCheck={false} placeholder={"filename,date,downloads,revenue\nfolded-paper-a1b2c3d4.jpg,2026-11-20,2,0.66"} className={`${input} font-mono text-xs`} />
      </label>
      <button disabled={pending} className={`${btn.primary} self-start disabled:opacity-50`}>
        {pending ? "Mengimpor…" : "Impor performa"}
        <ButtonIcon inverted>
          <IconUpload />
        </ButtonIcon>
      </button>
      <div aria-live="polite">
        {state && (
          <div className="flex flex-col gap-2 rounded-2xl bg-core-muted p-4 text-sm ring-1 ring-hairline">
            {state.error ? (
              <p className="text-danger">{state.error}</p>
            ) : (
              <p>
                <Badge tone="success">{state.imported} baris diimpor</Badge>
              </p>
            )}
            {state.unmatched.length > 0 && (
              <p className="text-muted">
                Tidak cocok dengan publikasi mana pun: <span className="font-mono text-xs">{state.unmatched.join(", ")}</span>
              </p>
            )}
            {state.parseErrors.length > 0 && <p className="text-xs text-warn">{state.parseErrors.slice(0, 5).join(" · ")}</p>}
          </div>
        )}
      </div>
    </form>
  );
}
