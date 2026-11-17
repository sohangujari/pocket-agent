"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Brain,
  CalendarClock,
  ClockArrowDown,
  CornerDownLeft,
  FolderOpen,
  LayoutDashboard,
  MessageCircle,
  MessageSquare,
  Moon,
  Route,
  Search,
  Settings,
  Sparkles,
  Sun,
  Wrench,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/cn";

type Item = { id: string; label: string; hint?: string; href?: string; action?: () => void; icon: any };

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const items = useMemo<Item[]>(() => {
    const nav: Item[] = [
      { id: "home", label: "Overview", href: "/", icon: LayoutDashboard },
      { id: "chat", label: "New chat", href: "/chat", icon: MessageSquare },
      { id: "sessions", label: "Sessions", href: "/sessions", icon: ClockArrowDown },
      { id: "memory", label: "Memory", href: "/memory", icon: Brain },
      { id: "skills", label: "Skills", href: "/skills", icon: Sparkles },
      { id: "schedules", label: "Schedules", href: "/schedules", icon: CalendarClock },
      { id: "files", label: "Files", href: "/files", icon: FolderOpen },
      { id: "journey", label: "Journey", href: "/journey", icon: Route },
      { id: "channels", label: "Channels", href: "/channels", icon: MessageCircle },
      { id: "tools", label: "Tools", href: "/tools", icon: Wrench },
      { id: "settings", label: "Settings", href: "/settings", icon: Settings },
    ];
    const actions: Item[] = [
      {
        id: "theme",
        label: "Toggle dark mode",
        hint: "Appearance",
        icon: Moon,
        action: () => {
          const dark = document.documentElement.classList.toggle("dark");
          localStorage.setItem("pa-theme", dark ? "dark" : "light");
        },
      },
      {
        id: "lite",
        label: "Toggle Lite mode",
        hint: "For slow devices",
        icon: Zap,
        action: () => {
          const lite = document.documentElement.classList.toggle("lite");
          localStorage.setItem("pa-lite", lite ? "1" : "0");
        },
      },
      {
        id: "signout",
        label: "Sign out",
        icon: Sun,
        action: async () => {
          await fetch("/api/auth/logout", { method: "POST" });
          router.replace("/login");
        },
      },
    ];
    return [...nav, ...actions];
  }, [router]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((i) => `${i.label} ${i.hint ?? ""}`.toLowerCase().includes(q));
  }, [items, query]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((v) => !v);
      }
      if (event.key === "Escape") setOpen(false);
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "n") {
        event.preventDefault();
        router.push("/chat");
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setIndex(0);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  function choose(item: Item | undefined) {
    if (!item) return;
    setOpen(false);
    if (item.action) item.action();
    else if (item.href) router.push(item.href);
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex h-9 w-full max-w-[380px] items-center gap-2 rounded-full border border-[var(--hairline)] bg-[var(--surface)] px-3.5 text-[0.78rem] text-[var(--ink-faint)] hover:border-[var(--hairline-strong)]"
      >
        <Search className="h-3.5 w-3.5" />
        <span className="flex-1 text-left">Search, run, remember…</span>
        <span className="kbd">⌘K</span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/25 px-4 pt-[14vh] backdrop-blur-[2px]"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-[540px] overflow-hidden rounded-[var(--r-lg)] border border-[var(--hairline)] bg-[var(--surface)] shadow-[var(--shadow-lift)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 border-b border-[var(--hairline)] px-4">
              <Search className="h-4 w-4 text-[var(--ink-faint)]" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setIndex(0);
                }}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setIndex((i) => Math.min(i + 1, filtered.length - 1));
                  }
                  if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setIndex((i) => Math.max(i - 1, 0));
                  }
                  if (e.key === "Enter") {
                    e.preventDefault();
                    choose(filtered[index]);
                  }
                }}
                placeholder="Go to a page, or run an action…"
                className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--ink-faint)]"
              />
              <span className="kbd">esc</span>
            </div>
            <div className="max-h-[320px] overflow-y-auto p-1.5">
              {filtered.length === 0 && (
                <p className="px-3 py-6 text-center text-[0.8rem] text-[var(--ink-faint)]">
                  Nothing matches “{query}”.
                </p>
              )}
              {filtered.map((item, i) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    onMouseEnter={() => setIndex(i)}
                    onClick={() => choose(item)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-[12px] px-3 py-2.5 text-left text-[0.84rem]",
                      i === index ? "bg-[var(--surface-3)]" : "hover:bg-[var(--surface-2)]",
                    )}
                  >
                    <Icon className="h-4 w-4 text-[var(--ink-muted)]" />
                    <span className="flex-1">{item.label}</span>
                    {item.hint && (
                      <span className="text-[0.68rem] text-[var(--ink-faint)]">{item.hint}</span>
                    )}
                    {i === index && <CornerDownLeft className="h-3.5 w-3.5 text-[var(--ink-faint)]" />}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
