import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { ensureBootstrap } from "@/lib/bootstrap";
import { getSetting } from "@pocket/core";
import { serverEnv } from "@pocket/shared/env";
import { Sidebar } from "@/components/sidebar";
import { MobileNav } from "@/components/mobile-nav";
import { CommandPalette } from "@/components/command-palette";
import { ThemeControls } from "@/components/theme-controls";
import { ToastProvider } from "@/components/toast-center";
import { Mark } from "@/components/mark";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireSession();
  await ensureBootstrap().catch(() => {});
  const ownerName = await getSetting<string>("owner_name", serverEnv.ownerName).catch(
    () => serverEnv.ownerName,
  );

  return (
    <ToastProvider>
      <div className="min-h-screen">
        <Sidebar name={ownerName} />

        <div className="lg:pl-[272px]">
          <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-[var(--hairline)] glass px-4 sm:px-6">
            <Link href="/" className="flex items-center gap-2 lg:hidden">
              <Mark className="h-5 w-5" />
              <span className="text-[0.92rem] font-semibold tracking-tight">Pocket Agent</span>
            </Link>

            <div className="hidden sm:block flex-1">
              <CommandPalette />
            </div>
            <div className="sm:hidden flex-1" />

            <div className="flex items-center gap-1.5">
              <ThemeControls />
              <Link
                href="/chat"
                className="btn btn-primary btn-sm hidden sm:inline-flex"
              >
                New task
              </Link>
            </div>
          </header>

          <main className="mx-auto w-full max-w-[1180px] px-4 pb-28 pt-6 sm:px-6 lg:px-8 lg:pb-14 lg:pt-8">
            {children}
          </main>
        </div>

        <MobileNav />
      </div>
    </ToastProvider>
  );
}
