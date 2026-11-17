"use client";

import { useEffect, useState } from "react";
import { Moon, Sun, Zap } from "lucide-react";
import { cn } from "@/lib/cn";

export function ThemeControls({ compact = false }: { compact?: boolean }) {
  const [dark, setDark] = useState(false);
  const [lite, setLite] = useState(false);

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
    setLite(document.documentElement.classList.contains("lite"));
  }, []);

  function toggleDark() {
    const next = document.documentElement.classList.toggle("dark");
    localStorage.setItem("pa-theme", next ? "dark" : "light");
    setDark(next);
  }

  function toggleLite() {
    const next = document.documentElement.classList.toggle("lite");
    localStorage.setItem("pa-lite", next ? "1" : "0");
    setLite(next);
  }

  return (
    <div className="flex items-center gap-1">
      <button
        onClick={toggleDark}
        className={cn(
          "flex h-8 w-8 items-center justify-center rounded-full text-[var(--ink-muted)] hover:bg-[var(--surface-3)] hover:text-[var(--ink)]",
        )}
        title={dark ? "Light mode" : "Dark mode"}
        aria-label="Toggle dark mode"
      >
        {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      </button>
      <button
        onClick={toggleLite}
        className={cn(
          "flex h-8 w-8 items-center justify-center rounded-full hover:bg-[var(--surface-3)]",
          lite ? "text-[var(--accent-ink)] bg-[var(--accent-soft)]" : "text-[var(--ink-muted)]",
        )}
        title={lite ? "Disable Lite mode" : "Enable Lite mode (low-end devices)"}
        aria-label="Toggle lite mode"
      >
        <Zap className="h-4 w-4" />
      </button>
    </div>
  );
}
