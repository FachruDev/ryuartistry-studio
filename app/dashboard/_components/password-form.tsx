"use client";

import { useActionState, useEffect, useRef } from "react";
import { changePasswordAction, type PasswordState } from "../account/actions";
import { btn, input } from "./ui";

const FIELDS = [
  { name: "current", label: "Kata sandi saat ini", auto: "current-password", hint: undefined },
  { name: "next", label: "Kata sandi baru", auto: "new-password", hint: "Minimal 10 karakter, tidak umum, dan tidak memuat nama pengguna." },
  { name: "confirm", label: "Ulangi kata sandi baru", auto: "new-password", hint: undefined },
] as const;

export function PasswordForm({ username }: { username: string }) {
  const [state, action, pending] = useActionState<PasswordState, FormData>(changePasswordAction, null);
  const formRef = useRef<HTMLFormElement>(null);

  // Focus the field that needs fixing; clear the form after a successful change.
  useEffect(() => {
    if (state?.field) formRef.current?.querySelector<HTMLInputElement>(`[name="${state.field}"]`)?.focus();
    if (state?.ok) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={action} className="flex max-w-md flex-col gap-5">
      {/* Lets password managers attach the new password to the right account. */}
      <input type="text" name="username" autoComplete="username" value={username} readOnly hidden />
      {FIELDS.map((f) => (
        <div key={f.name} className="flex flex-col gap-1.5">
          <label htmlFor={`pw-${f.name}`} className="text-sm font-medium">
            {f.label}
          </label>
          <input
            id={`pw-${f.name}`}
            name={f.name}
            type="password"
            autoComplete={f.auto}
            required
            aria-invalid={state?.field === f.name || undefined}
            aria-describedby={state?.field === f.name ? "pw-status" : f.hint ? `pw-${f.name}-hint` : undefined}
            className={`${input} aria-[invalid=true]:ring-danger`}
          />
          {f.hint && (
            <p id={`pw-${f.name}-hint`} className="text-xs text-subtle">
              {f.hint}
            </p>
          )}
        </div>
      ))}
      <p id="pw-status" aria-live="polite" className={`min-h-5 text-sm ${state?.error ? "text-danger" : "text-success"}`}>
        {state?.error ?? state?.ok ?? ""}
      </p>
      <button type="submit" disabled={pending} className={`${btn.primary} self-start pr-5 disabled:opacity-60`}>
        {pending ? "Menyimpan…" : "Ganti Kata Sandi"}
      </button>
    </form>
  );
}
