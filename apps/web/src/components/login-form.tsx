"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, LoaderCircle } from "lucide-react";

export function LoginForm({ next }: { next?: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (json.setupRequired) {
          router.refresh();
          return;
        }
        setError(json.error ?? "Could not sign in.");
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
          htmlFor="password"
          className="block text-[0.72rem] font-medium uppercase tracking-[0.12em] text-[var(--ink-faint)] mb-2"
        >
          Password
        </label>
        <input
          id="password"
          type="password"
          autoFocus
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="input h-11"
          placeholder="••••••••••••"
          disabled={loading}
        />
      </div>

      {error && (
        <p className="text-[0.78rem] text-[var(--danger)]" role="alert">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={loading || password.length === 0}
        className="btn btn-primary w-full h-11"
      >
        {loading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
        {loading ? "Signing in" : "Enter"}
        {!loading && <ArrowRight className="h-4 w-4" />}
      </button>
    </form>
  );
}
