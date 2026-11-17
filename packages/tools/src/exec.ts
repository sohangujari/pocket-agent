import { exec } from "node:child_process";
import { mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { z } from "zod";
import { serverEnv } from "@pocket/shared/env";
import { defineTool } from "./helpers.js";

/**
 * Shell execution is OFF unless EXEC_BACKEND=local is set explicitly.
 * On Render this runs inside the disposable container, in a per-run temp
 * directory. It is not a sandbox — approvals and the allowlist are the
 * guardrails. Prefer a real sandbox (E2B/Daytona) for untrusted work.
 */
export const terminal = defineTool({
  name: "terminal",
  description:
    "Run a shell command in the agent workspace. Disabled unless the owner enabled it. Commands are approval-gated and restricted to the configured allowlist. Prefer file_read/file_write when a shell is not required.",
  schema: z.object({
    command: z.string().min(1).max(2000),
    cwd: z.string().max(200).optional(),
  }),
  risk: "dangerous",
  toolsets: ["exec"],
  timeoutMs: 45_000,
  label: "Running a command",
  async run(input, ctx) {
    if (serverEnv.execBackend !== "local") {
      throw new Error(
        "Terminal access is disabled. Set EXEC_BACKEND=local and restart to enable it, or connect a sandbox backend.",
      );
    }

    const allowlist = serverEnv.execAllowlist;
    if (allowlist.length > 0) {
      const binary = input.command.trim().split(/\s+/)[0];
      if (!allowlist.includes(binary)) {
        throw new Error(
          `Command "${binary}" is not in EXEC_ALLOWLIST (${allowlist.join(", ")}).`,
        );
      }
    }

    const base = path.join(os.tmpdir(), "pocket-agent", ctx.runId);
    const cwd = input.cwd
      ? path.resolve(base, input.cwd.replace(/^\/+/, ""))
      : base;
    if (!cwd.startsWith(base)) throw new Error("Working directory escapes the run workspace.");
    await mkdir(cwd, { recursive: true });

    return await new Promise((resolve) => {
      exec(
        input.command,
        {
          cwd,
          timeout: 30_000,
          maxBuffer: 1_000_000,
          env: { ...process.env, HOME: base, PWD: cwd },
          shell: "/bin/bash",
        },
        (error, stdout, stderr) => {
          resolve({
            stdout: stdout.slice(0, 20_000),
            stderr: stderr.slice(0, 8_000),
            exitCode: error && "code" in error ? (error as any).code : 0,
            cwd,
          });
        },
      );
    });
  },
});
