"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, Eye, EyeOff, LoaderCircle } from "lucide-react";

function strength(password: string): { score: number; label: string } {
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;
  const label = ["Too short", "Weak", "Okay", "Good", "Strong", "Very strong"][score] ?? "Strong";
  return { score, label };
}

export function SetupForm({ next }: { next?: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const meter = useMemo(() => strength(password), [password]);
  const mismatch = confirm.length > 0 && password !== confirm;
  const valid = password.length >= 8 && password === confirm;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!valid) return;

    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/setup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password, confirm }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 409) {
          router.refresh();
          return;
        }
        setError(json.error ?? "Could not save the password.");
        setLoading(false);
        return;
      }
      router.replace(next && next.startsWith("/") ? next : "/");
      router.refresh();
    } catch {
      setError("Network error. Is the server awake?");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label
          htmlFor="new-password"
          className="block text-[0.72rem] font-medium uppercase tracking-[0.12em] text-[var(--ink-faint)] mb-2"
        >
          Password
        </label>
        <div className="relative">
          <input
            id="new-password"
            type={show ? "text" : "password"}
            autoFocus
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="input h-11 pr-10"
            placeholder="At least 8 characters"
          />
          <button
            type="button"
            onClick={() => setShow((v) => !v)}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-[var(--ink-faint)] hover:bg-[var(--surface-3)] hover:text-[var(--ink)]"
            aria-label={show ? "Hide password" : "Show password"}
          >
            {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>

        <div className="mt-2 flex items-center gap-2">
          <div className="flex h-1 flex-1 gap-1">
            {[0, 1, 2, 3, 4].map((i) => (
              <span
                key={i}
                className="h-full flex-1 rounded-full"
                style={{
                  background:
                    password.length === 0
                      ? "var(--hairline)"
                      : i < meter.score
                        ? meter.score >= 4
                          ? "var(--ok)"
                          : meter.score >= 3
                            ? "var(--accent)"
                            : "var(--danger)"
                        : "var(--hairline)",
                }}
              />
            ))}
          </div>
          <span className="w-16 text-right text-[0.66rem] text-[var(--ink-faint)]">
            {password.length === 0 ? "" : meter.label}
          </span>
        </div>
      </div>

      <div>
        <label
          htmlFor="confirm-password"
          className="block text-[0.72rem] font-medium uppercase tracking-[0.12em] text-[var(--ink-faint)] mb-2"
        >
          Confirm password
        </label>
        <div className="relative">
          <input
            id="confirm-password"
            type={show ? "text" : "password"}
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="input h-11 pr-10"
            placeholder="Repeat it"
          />
          {confirm.length > 0 && !mismatch && (
            <Check className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--ok)]" />
          )}
        </div>
        {mismatch && (
          <p className="mt-1.5 text-[0.72rem] text-[var(--danger)]">Passwords do not match.</p>
        )}
      </div>

      {error && (
        <p className="text-[0.78rem] text-[var(--danger)]" role="alert">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={loading || !valid}
        className="btn btn-primary w-full h-11"
      >
        {loading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
        {loading ? "Saving" : "Set password & enter"}
        {!loading && <ArrowRight className="h-4 w-4" />}
      </button>
    </form>
  );
}
