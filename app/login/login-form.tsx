"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { IconArrow } from "@/app/dashboard/_components/icons";
import { loginAction, type LoginState } from "./actions";

const field =
  "w-full rounded-2xl bg-core-muted px-4 py-3 text-[15px] text-text ring-1 ring-hairline placeholder:text-subtle transition-[box-shadow] duration-500 ease-fluid focus:outline-none focus-visible:ring-2 focus-visible:ring-accent aria-[invalid=true]:ring-danger";

export function LoginForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(loginAction, null);
  const [showPassword, setShowPassword] = useState(false);
  const userRef = useRef<HTMLInputElement>(null);
  const passRef = useRef<HTMLInputElement>(null);

  // Put the cursor on the field that needs fixing.
  useEffect(() => {
    if (state?.field === "username") userRef.current?.focus();
    if (state?.field === "password") passRef.current?.select();
  }, [state]);

  return (
    <form
      action={(formData) => {
        // ?next= is read at submit time so the page stays static; the server re-validates it (safeNext).
        formData.set("next", new URLSearchParams(window.location.search).get("next") ?? "/dashboard");
        action(formData);
      }}
      className="flex flex-col gap-5"
      noValidate
    >
      <div className="flex flex-col gap-2">
        <label htmlFor="username" className="text-sm font-medium">
          Nama pengguna
        </label>
        <input
          ref={userRef}
          id="username"
          name="username"
          type="text"
          autoComplete="username"
          defaultValue={state?.username ?? ""}
          autoCapitalize="none"
          spellCheck={false}
          required
          placeholder="admin…"
          aria-invalid={state?.field === "username" || undefined}
          aria-describedby={state?.field === "username" ? "login-error" : undefined}
          className={field}
        />
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="password" className="text-sm font-medium">
          Kata sandi
        </label>
        <div className="relative">
          <input
            ref={passRef}
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            required
            placeholder="••••••••"
            aria-invalid={state?.field === "password" || undefined}
            aria-describedby={state?.field === "password" ? "login-error" : undefined}
            className={`${field} pr-20`}
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-pressed={showPassword}
            aria-controls="password"
            className="absolute inset-y-1.5 right-1.5 rounded-xl px-3 text-xs font-medium text-muted transition-colors duration-300 ease-fluid hover:bg-shell hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            {showPassword ? "Sembunyikan" : "Tampilkan"}
          </button>
        </div>
      </div>

      <p id="login-error" aria-live="polite" className="min-h-5 text-sm text-danger">
        {state?.error ?? ""}
      </p>

      <button
        type="submit"
        disabled={pending}
        className="group inline-flex items-center justify-between gap-3 rounded-full bg-text py-2 pl-6 pr-2 text-[15px] font-medium text-bg transition-[transform,opacity] duration-500 ease-fluid hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-core active:scale-[0.98] disabled:opacity-60"
      >
        {pending ? "Memeriksa…" : "Masuk ke Studio"}
        <span
          aria-hidden="true"
          className={`flex h-9 w-9 items-center justify-center rounded-full bg-bg/15 transition-transform duration-500 ease-fluid group-hover:-translate-y-px group-hover:translate-x-0.5 group-hover:scale-105 ${pending ? "animate-pulse" : ""}`}
        >
          <IconArrow />
        </span>
      </button>
    </form>
  );
}
