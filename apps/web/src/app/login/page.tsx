import { redirect } from "next/navigation";
import { getSession, passwordState } from "@/lib/auth";
import { LoginForm } from "@/components/login-form";
import { SetupForm } from "@/components/setup-form";
import { Mark } from "@/components/mark";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const session = await getSession();
  if (session) redirect("/");
  const { next } = await searchParams;
  const state = await passwordState();
  const setup = state === "none";

  return (
    <div className="min-h-screen grid lg:grid-cols-[1.05fr_0.95fr]">
      <div className="relative hidden lg:flex flex-col justify-between p-12 overflow-hidden">
        <div className="absolute inset-0 hero" />
        <div className="relative flex items-center gap-2.5">
          <Mark className="h-7 w-7 text-[#3b2806]" />
          <span className="text-lg font-semibold tracking-tight text-[#3b2806]">Pocket Agent</span>
        </div>

        <div className="relative max-w-[460px]">
          <p className="text-[0.7rem] uppercase tracking-[0.18em] text-[#6b4d13]/80 mb-4">
            Autonomous · Persistent · Yours
          </p>
          <h1 className="hero-serif text-[clamp(2.6rem,4.4vw,4rem)] text-[#33240a]">
            An agent that
            <br />
            keeps working
            <br />
            after you close
            <br />
            the tab.
          </h1>
          <p className="mt-6 text-[0.95rem] leading-relaxed text-[#5b4315]/90 max-w-[380px]">
            Memory, skills, schedules and real tools — running on a server, driven from
            any device you own.
          </p>
        </div>

        <div className="relative flex items-center gap-6 text-[0.72rem] text-[#6b4d13]/80">
          <span>Runs on Render</span>
          <span className="h-1 w-1 rounded-full bg-[#6b4d13]/30" />
          <span>State in Supabase</span>
          <span className="h-1 w-1 rounded-full bg-[#6b4d13]/30" />
          <span>Works on a 2 GB phone</span>
        </div>
      </div>

      <div className="flex items-center justify-center px-6 py-16">
        <div className="w-full max-w-[400px] fade-in">
          <div className="lg:hidden flex items-center gap-2.5 mb-10">
            <Mark className="h-6 w-6" />
            <span className="text-lg font-semibold tracking-tight">Pocket Agent</span>
          </div>

          {setup ? (
            <>
              <p className="text-[0.68rem] uppercase tracking-[0.18em] text-[var(--ink-faint)] mb-2">
                First run
              </p>
              <h2 className="display text-[2.1rem] mb-2">Set your dashboard password</h2>
              <p className="text-sm text-[var(--ink-muted)] mb-8">
                Choose a password to protect access to this dashboard. You will use it every
                time you sign in.
              </p>

              <SetupForm next={next} />

              <p className="mt-8 text-[0.7rem] leading-relaxed text-[var(--ink-faint)]">
                Stored as a salted scrypt hash in your database. It is never sent anywhere
                else, and it is never written to the logs.
              </p>
            </>
          ) : (
            <>
              <h2 className="display text-[2.1rem] mb-2">Welcome back</h2>
              <p className="text-sm text-[var(--ink-muted)] mb-8">
                This instance has a single owner. Enter your password to continue.
              </p>

              <LoginForm next={next} />

              <p className="mt-8 text-[0.7rem] leading-relaxed text-[var(--ink-faint)]">
                Sessions are signed with AUTH_SECRET and stored in an HttpOnly cookie.
                Nothing is sent to a third party.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
