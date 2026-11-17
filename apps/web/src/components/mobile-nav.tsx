"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Brain, LayoutDashboard, MessageCircle, MessageSquare, Settings, Sparkles } from "lucide-react";
import { cn } from "@/lib/cn";

const items = [
  { href: "/", label: "Home", icon: LayoutDashboard },
  { href: "/chat", label: "Chat", icon: MessageSquare },
  { href: "/channels", label: "Channels", icon: MessageCircle },
  { href: "/memory", label: "Memory", icon: Brain },
  { href: "/skills", label: "Skills", icon: Sparkles },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function MobileNav() {
  const pathname = usePathname();
  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 flex items-stretch justify-around border-t border-[var(--hairline)] glass px-1 pb-[env(safe-area-inset-bottom)] lg:hidden">
      {items.map((item) => {
        const Icon = item.icon;
        const active = isActive(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex flex-1 flex-col items-center gap-0.5 py-2 text-[0.62rem]",
              active ? "text-[var(--ink)]" : "text-[var(--ink-faint)]",
            )}
          >
            <Icon className="h-[18px] w-[18px]" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
