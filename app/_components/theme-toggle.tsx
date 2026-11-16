"use client";

import { IconMoon, IconSun } from "@/app/dashboard/_components/icons";

export function toggleTheme() {
  const root = document.documentElement;
  const next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
  root.setAttribute("data-theme", next);
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", next === "dark" ? "#08080a" : "#f6f5f1");
  try {
    localStorage.setItem("studio-theme", next);
  } catch {
    // Storage blocked: the switch still applies to this page view.
  }
}

/** Shows the icon of the theme you would switch to (CSS decides which, so no hydration mismatch). */
export function ThemeToggle({ className = "" }: { className?: string }) {
  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label="Ganti tema terang atau gelap"
      title="Ganti tema"
      className={`flex h-9 w-9 items-center justify-center rounded-full text-muted ring-1 ring-hairline transition-[transform,color,background-color] duration-500 ease-fluid hover:bg-shell hover:text-text focus-visible:ring-2 focus-visible:ring-accent active:scale-[0.94] ${className}`}
    >
      <IconSun className="theme-icon-sun" />
      <IconMoon className="theme-icon-moon" />
    </button>
  );
}
