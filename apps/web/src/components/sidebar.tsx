"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Brain,
  CalendarClock,
  ClockArrowDown,
  FolderOpen,
  LayoutDashboard,
  LogOut,
  MessageCircle,
  MessageSquare,
  Route,
  Settings,
  Sparkles,
  Wrench,
  Plus,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { Mark } from "./mark";

const groups = [
  {
    label: "Main",
    items: [
      { href: "/", label: "Overview", icon: LayoutDashboard },
      { href: "/chat", label: "Chat", icon: MessageSquare },
      { href: "/sessions", label: "Sessions", icon: ClockArrowDown },
    ],
  },
  {
    label: "Workspace",
    items: [
      { href: "/memory", label: "Memory", icon: Brain },
      { href: "/skills", label: "Skills", icon: Sparkles },
      { href: "/schedules", label: "Schedules", icon: CalendarClock },
      { href: "/files", label: "Files", icon: FolderOpen },
      { href: "/journey", label: "Journey", icon: Route },
    ],
  },
  {
    label: "System",
    items: [
      { href: "/channels", label: "Channels", icon: MessageCircle },
      { href: "/tools", label: "Tools", icon: Wrench },
      { href: "/settings", label: "Settings", icon: Settings },
    ],
  },
];

export function Sidebar({ name }: { name: string }) {
  const pathname = usePathname();
  const router = useRouter();

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-[272px] flex-col border-r border-[var(--hairline)] glass px-4 py-5 lg:flex">
      <div className="flex items-center justify-between px-1">
        <Link href="/" className="flex items-center gap-2.5">
          <Mark className="h-6 w-6" />
          <span className="text-[1.02rem] font-semibold tracking-[-0.02em]">Pocket Agent</span>
        </Link>
      </div>

      <Link href="/chat" className="btn btn-primary mt-6 w-full justify-between">
        <span className="flex items-center gap-2">
          <Plus className="h-4 w-4" /> New task
        </span>
        <span className="text-[0.65rem] opacity-60">⌘N</span>
      </Link>

      <nav className="mt-6 flex-1 space-y-6 overflow-y-auto pb-4">
        {groups.map((group) => (
          <div key={group.label}>
            <p className="px-2.5 mb-1.5 text-[0.63rem] font-medium uppercase tracking-[0.16em] text-[var(--ink-faint)]">
              {group.label}
            </p>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn("sidebar-link", isActive(item.href) && "active")}
                  >
                    <Icon />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-[var(--hairline)] pt-3">
        <div className="flex items-center gap-2.5 rounded-[14px] px-2 py-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--butter)] text-[0.75rem] font-semibold text-[var(--butter-ink)]">
            {(name || "O").slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[0.78rem] font-medium">{name || "Owner"}</p>
            <p className="truncate text-[0.66rem] text-[var(--ink-faint)]">Personal workspace</p>
          </div>
          <button
            onClick={logout}
            className="rounded-lg p-1.5 text-[var(--ink-faint)] hover:bg-[var(--surface-3)] hover:text-[var(--ink)]"
            title="Sign out"
            aria-label="Sign out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
