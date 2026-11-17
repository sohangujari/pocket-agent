"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import Link from "next/link";
import { CalendarClock, X } from "lucide-react";

/**
 * Sticky confirmations for things the agent created (reminders, schedules).
 * Lives in the app layout so a page refresh or a ChatView remount cannot drop
 * a toast — it stays until the owner dismisses it.
 */
export type AppToast = {
  id: string;
  title: string;
  detail: string;
  kind: "once" | "cron";
};

type ToastInput = Omit<AppToast, "id"> & { id?: string };

type ToastContextValue = {
  push: (toast: ToastInput) => void;
  dismiss: (id: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<AppToast[]>([]);

  const push = useCallback((toast: ToastInput) => {
    const id = toast.id ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setToasts((prev) => (prev.some((t) => t.id === id) ? prev : [...prev, { ...toast, id }]));
  }, []);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const value = useMemo(() => ({ push, dismiss }), [push, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {toasts.length > 0 && (
        <div className="pointer-events-none fixed inset-x-4 bottom-20 z-50 flex flex-col items-stretch gap-2 sm:inset-x-auto sm:bottom-6 sm:right-6 sm:w-[360px]">
          {toasts.map((toast) => (
            <div
              key={toast.id}
              role="status"
              aria-live="polite"
              className="pointer-events-auto rounded-[14px] border border-[var(--hairline)] bg-[var(--surface)] p-3.5 shadow-[0_18px_45px_rgba(20,16,10,0.22)]"
            >
              <div className="flex items-start gap-2.5">
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--butter)] text-[var(--butter-ink)]">
                  <CalendarClock className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[0.78rem] leading-snug font-medium">
                    {toast.title}{" "}
                    <span className="chip ml-1 align-middle">
                      {toast.kind === "once" ? "one-time" : "recurring"}
                    </span>
                  </p>
                  <p className="mt-1 text-[0.72rem] leading-relaxed text-[var(--ink-muted)]">
                    {toast.detail}
                  </p>
                  <Link
                    href="/schedules"
                    className="mt-1.5 inline-block text-[0.7rem] text-[var(--ink-muted)] underline decoration-dotted"
                  >
                    View schedules
                  </Link>
                </div>
                <button
                  onClick={() => dismiss(toast.id)}
                  className="shrink-0 rounded-md p-1 text-[var(--ink-faint)] hover:bg-[var(--surface-3)] hover:text-[var(--ink)]"
                  aria-label="Dismiss reminder notice"
                  title="Dismiss"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </ToastContext.Provider>
  );
}

/** No-op fallback keeps the chat usable if it is ever rendered outside the provider. */
const NOOP: ToastContextValue = { push: () => {}, dismiss: () => {} };

export function useToasts(): ToastContextValue {
  return useContext(ToastContext) ?? NOOP;
}
