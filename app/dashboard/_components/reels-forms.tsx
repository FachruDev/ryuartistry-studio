"use client";

import { useActionState, useState } from "react";
import { markReelPostedAction, recordReelRestrictionAction, type ReelActionState } from "../actions";
import { IconCheck } from "./icons";
import { ButtonIcon, btn, input } from "./ui";

export function CopyText({ text, label, copyLabel = "Salin caption & hashtag", rows = 5 }: { text: string; label: string; copyLabel?: string; rows?: number }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-col gap-2">
      <textarea readOnly value={text} rows={rows} aria-label={label} className={`${input} resize-none font-mono text-xs leading-relaxed`} />
      <button
        type="button"
        className={`${btn.plain} self-start`}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          } catch {
            setCopied(false);
          }
        }}
      >
        {copied ? "Tersalin" : copyLabel}
      </button>
      <span aria-live="polite" className="sr-only">
        {copied ? "Caption tersalin ke clipboard" : ""}
      </span>
    </div>
  );
}

export function MarkPostedForm({ publicationId }: { publicationId: string }) {
  const [state, action, pending] = useActionState<ReelActionState, FormData>(markReelPostedAction, null);
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="publicationId" value={publicationId} />
      <label htmlFor={`post-${publicationId}`} className="text-sm text-muted">
        Link reel setelah diposting
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          id={`post-${publicationId}`}
          name="postUrl"
          type="url"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          required
          placeholder="https://www.facebook.com/reel/…"
          className={input}
        />
        <button type="submit" disabled={pending} className={`${btn.primary} shrink-0 disabled:opacity-60`}>
          {pending ? "Menyimpan…" : "Tandai Terposting"}
          <ButtonIcon inverted>
            <IconCheck />
          </ButtonIcon>
        </button>
      </div>
      <p aria-live="polite" className={`min-h-4 text-xs ${state?.error ? "text-danger" : "text-success"}`}>
        {state?.error ?? state?.ok ?? ""}
      </p>
    </form>
  );
}

export function RestrictionForm({ publicationId }: { publicationId: string }) {
  const [state, action, pending] = useActionState<ReelActionState, FormData>(recordReelRestrictionAction, null);
  return (
    <form
      action={(formData) => {
        // Archives the job and cannot be undone from the dashboard, so ask first.
        if (!window.confirm("Tandai reel ini dibatasi Meta? Job akan diarsipkan dan alasannya dicatat untuk agen.")) return;
        action(formData);
      }}
      className="flex flex-col gap-2 sm:flex-row sm:items-start"
    >
      <input type="hidden" name="publicationId" value={publicationId} />
      <div className="flex-1">
        <label htmlFor={`restrict-${publicationId}`} className="sr-only">
          Alasan dari Meta
        </label>
        <input
          id={`restrict-${publicationId}`}
          name="reason"
          autoComplete="off"
          placeholder="Alasan dari Meta, mis. konten tidak orisinal…"
          className={input}
        />
        <p aria-live="polite" className={`mt-1 min-h-4 text-xs ${state?.error ? "text-danger" : "text-success"}`}>
          {state?.error ?? state?.ok ?? ""}
        </p>
      </div>
      <button type="submit" disabled={pending} className={`${btn.plain} shrink-0 disabled:opacity-60`}>
        {pending ? "Mencatat…" : "Dibatasi Meta"}
      </button>
    </form>
  );
}
