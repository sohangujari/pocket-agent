export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;

  // Fail fast on bad configuration before the worker starts claiming runs.
  const { validateEnv } = await import("@pocket/shared/env");
  const { warnings } = validateEnv();
  for (const warning of warnings) console.warn(`[env] ${warning}`);

  const { startWorker } = await import("./lib/worker");
  startWorker();
}
