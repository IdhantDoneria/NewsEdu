"use client";

import { useEffect, useState } from "react";

const KEY = "lumina.theme";

function apply(theme: "light" | "dark") {
  document.documentElement.classList.toggle("dark", theme === "dark");
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    // private mode — theme just won't persist
  }
}

export default function ThemeToggle({ className = "" }: { className?: string }) {
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    setTheme(
      document.documentElement.classList.contains("dark") ? "dark" : "light",
    );
  }, []);

  const flip = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    apply(next);
  };

  return (
    <button
      type="button"
      onClick={flip}
      aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
      className={`rounded-md px-2 py-1 text-sm text-[var(--fg-faint)] transition-colors hover:bg-[var(--bg-raised)] hover:text-[var(--fg)] ${className}`}
    >
      {theme === "dark" ? "☼" : "☾"}
    </button>
  );
}
