"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";

/**
 * Accessible menu button: Esc and outside click close it, arrow keys move between items,
 * focus goes to the first item on open and back to the trigger on close.
 */
export function Dropdown({
  label,
  trigger,
  children,
  width = "w-80",
  triggerClassName = "",
}: {
  label: string;
  trigger: ReactNode;
  children: (close: () => void) => ReactNode;
  width?: string;
  triggerClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const close = () => setOpen(false);

  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    const button = buttonRef.current;
    const items = () => [...(panel?.querySelectorAll<HTMLElement>("[data-menu-item]") ?? [])];
    items()[0]?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
      } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        const list = items();
        const i = list.indexOf(document.activeElement as HTMLElement);
        const next = e.key === "ArrowDown" ? (i + 1) % list.length : (i - 1 + list.length) % list.length;
        list[next]?.focus();
        e.preventDefault();
      }
    };
    const onPointer = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
      // Return focus to the trigger if it was inside the menu (keyboard close), not after an outside click.
      if (!document.activeElement || document.activeElement === document.body || panel?.contains(document.activeElement)) button?.focus();
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
        className={`relative flex h-9 items-center justify-center rounded-full ring-1 ring-hairline transition-[background-color,color,transform] duration-500 ease-fluid hover:bg-shell focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent active:scale-[0.96] ${triggerClassName}`}
      >
        {trigger}
      </button>
      {open && (
        <div
          ref={panelRef}
          id={id}
          role="menu"
          aria-label={label}
          className={`rise absolute right-0 top-full z-40 mt-2 ${width} max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-[1.25rem] bg-shell p-1.5 ring-1 ring-hairline`}
          style={{ animationDuration: "500ms" }}
        >
          <div className="max-h-[70vh] overflow-y-auto overscroll-contain rounded-[calc(1.25rem-0.375rem)] bg-core shadow-[inset_0_1px_0_var(--highlight),var(--ambient)]">
            {children(close)}
          </div>
        </div>
      )}
    </div>
  );
}

export const menuItem =
  "flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors duration-300 ease-fluid hover:bg-shell focus-visible:bg-shell focus-visible:outline-none";
