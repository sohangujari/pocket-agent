#!/usr/bin/env node
import { Command } from "commander";
import pc from "picocolors";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { PocketClient, type RunEvent } from "./client.js";
import { readConfig, resolveCredentials, writeConfig } from "./config.js";

const program = new Command();

program
  .name("pocket-agent")
  .description("Talk to your Pocket Agent from any terminal.")
  .version("0.1.0");

type CommonFlags = { url?: string; key?: string };

function printEvent(event: RunEvent, state: { printedText: boolean }) {
  const payload = event.payload ?? {};
  switch (event.type) {
    case "text": {
      const delta = String(payload.delta ?? "");
      if (delta) {
        state.printedText = true;
        process.stdout.write(delta);
      }
      break;
    }
    case "tool_call": {
      if (state.printedText) {
        process.stdout.write("\n");
        state.printedText = false;
      }
      const args = JSON.stringify(payload.args ?? {});
      const short = args.length > 160 ? `${args.slice(0, 160)}…` : args;
      console.log(pc.dim(`  ⚙ ${payload.name} ${short}`));
      break;
    }
    case "tool_result": {
      const text = String(payload.output ?? "");
      const firstLine = text.split("\n").find((l) => l.trim()) ?? "";
      const short = firstLine.length > 140 ? `${firstLine.slice(0, 140)}…` : firstLine;
      console.log(
        payload.ok === false
          ? pc.red(`    ✕ ${short}`)
          : pc.dim(`    ✓ ${short}`),
      );
      break;
    }
    case "approval_request": {
      break;
    }
    case "todo": {
      const items = Array.isArray(payload.items) ? payload.items : [];
      if (items.length > 0) {
        console.log(pc.dim("\n  plan:"));
        for (const item of items) {
          const mark = item.status === "done" ? "✓" : item.status === "in_progress" ? "▸" : "·";
          console.log(pc.dim(`    ${mark} ${item.text}`));
        }
      }
      break;
    }
    case "usage": {
      console.log(
        pc.dim(
          `\n  tokens: ${Number(payload.total ?? 0).toLocaleString()} · cost: $${Number(
            payload.costUsd ?? 0,
          ).toFixed(4)}`,
        ),
      );
      break;
    }
    case "provider_error": {
      console.log(pc.yellow(`\n  provider ${payload.provider} failed: ${payload.message}`));
      break;
    }
    case "error": {
      if (state.printedText) {
        process.stdout.write("\n");
        state.printedText = false;
      }
      console.error(pc.red(`\n  ✕ ${payload.message}`));
      break;
    }
    case "delegate_started": {
      console.log(pc.dim(`\n  ↳ delegated: ${payload.label}`));
      break;
    }
    case "delegate_finished": {
      console.log(pc.dim("  ↳ child finished"));
      break;
    }
  }
}

async function watchRun(
  client: PocketClient,
  runId: string,
  options: { autoApprove?: boolean } = {},
): Promise<string> {
  const state = { printedText: false };
  const rl = createInterface({ input, output });

  try {
    const status = await client.watch(runId, {
      onEvent: (event) => {
        if (event.type === "text") {
          state.printedText = true;
          process.stdout.write(String(event.payload?.delta ?? ""));
          return;
        }
        printEvent(event, state);
      },
      onApproval: async (event) => {
        if (state.printedText) {
          process.stdout.write("\n");
          state.printedText = false;
        }
        const payload = event.payload ?? {};
        console.log(pc.yellow(`\n  approval needed: ${payload.name} (${payload.risk})`));
        console.log(pc.dim(`  ${JSON.stringify(payload.args, null, 2).slice(0, 1200)}`));

        if (options.autoApprove) {
          console.log(pc.dim("  auto-approved (--yes)"));
          return "approved";
        }

        const answer = (await rl.question(pc.bold("  allow? [y/N] "))).trim().toLowerCase();
        return answer === "y" || answer === "yes" ? "approved" : "rejected";
      },
    });

    if (state.printedText) process.stdout.write("\n");
    if (status === "completed") console.log(pc.green("\n  done."));
    else if (status === "cancelled") console.log(pc.yellow("\n  cancelled."));
    else console.log(pc.red("\n  run failed."));
    return status;
  } finally {
    rl.close();
  }
}

program
  .command("login")
  .description("Save the dashboard URL and an API key (Settings → API keys).")
  .option("--url <url>", "dashboard URL, e.g. https://pocket-agent.onrender.com")
  .option("--key <key>", "API key starting with pa_")
  .action(async (options: CommonFlags) => {
    const config = await readConfig();
    const url = (options.url ?? config.url ?? "").replace(/\/+$/, "");
    const key = options.key ?? config.apiKey ?? "";

    if (!url || !key) {
      console.error(
        pc.red("Provide --url and --key.\n") +
          pc.dim("  pocket-agent login --url https://your-app.onrender.com --key pa_..."),
      );
      process.exitCode = 1;
      return;
    }

    await writeConfig({ url, apiKey: key });
    const client = new PocketClient(url, key);
    try {
      await client.listRuns();
      console.log(pc.green(`Saved. Connected to ${url}.`));
    } catch (error) {
      console.error(
        pc.yellow(`Saved, but the connection check failed: ${(error as Error).message}`),
      );
    }
  });

program
  .command("logout")
  .description("Forget the saved URL and API key.")
  .action(async () => {
    await writeConfig({ url: undefined, apiKey: undefined, sessionId: undefined });
    console.log(pc.green("Signed out on this machine."));
  });

program
  .command("health")
  .description("Check that the server and database are reachable.")
  .option("--url <url>")
  .action(async (options: CommonFlags) => {
    const { url } = await resolveCredentials(options);
    try {
      const res = await fetch(`${url}/api/health`);
      const json = (await res.json()) as { ok: boolean; db: string; latencyMs?: number };
      console.log(
        json.ok
          ? pc.green(`ok · database ${json.db} · ${json.latencyMs ?? "?"}ms`)
          : pc.red(`degraded · database ${json.db}`),
      );
    } catch (error) {
      console.error(pc.red(`unreachable: ${(error as Error).message}`));
      process.exitCode = 1;
    }
  });

program
  .command("ask")
  .description("Send one task and stream the result.")
  .argument("<message...>", "what the agent should do")
  .option("--session <id>", "continue an existing session")
  .option("--new", "start a fresh session")
  .option("--yes", "auto-approve tool actions")
  .option("--url <url>")
  .option("--key <key>")
  .action(async (words: string[], options: CommonFlags & { session?: string; new?: boolean; yes?: boolean }) => {
    const { url, apiKey } = await resolveCredentials(options);
    const client = new PocketClient(url, apiKey);
    const config = await readConfig();

    const message = words.join(" ").trim();
    const sessionId = options.new ? undefined : (options.session ?? config.sessionId);

    const created = await client.createRun(message, sessionId);
    await writeConfig({ sessionId: created.sessionId });
    console.log(pc.dim(`run ${created.runId}`));
    console.log();

    await watchRun(client, created.runId, { autoApprove: options.yes });
  });

program
  .command("chat")
  .description("Interactive chat with one continuous session.")
  .option("--session <id>", "continue an existing session")
  .option("--yes", "auto-approve tool actions")
  .option("--url <url>")
  .option("--key <key>")
  .action(async (options: CommonFlags & { session?: string; yes?: boolean }) => {
    const { url, apiKey } = await resolveCredentials(options);
    const client = new PocketClient(url, apiKey);
    const config = await readConfig();

    let sessionId = options.session ?? config.sessionId;
    const rl = createInterface({ input, output });

    console.log(pc.bold("Pocket Agent") + pc.dim(" · type /exit to leave, /new for a fresh session"));
    if (sessionId) console.log(pc.dim(`continuing session ${sessionId}`));
    console.log();

    try {
      while (true) {
        const line = (await rl.question(pc.cyan("you › "))).trim();
        if (!line) continue;
        if (line === "/exit" || line === "/quit") break;
        if (line === "/new") {
          sessionId = undefined;
          await writeConfig({ sessionId: undefined });
          console.log(pc.dim("starting a fresh session"));
          continue;
        }

        const created = await client.createRun(line, sessionId);
        sessionId = created.sessionId;
        await writeConfig({ sessionId });

        console.log();
        await watchRun(client, created.runId, { autoApprove: options.yes });
        console.log();
      }
    } finally {
      rl.close();
    }
  });

program
  .command("runs")
  .description("List recent runs.")
  .option("--json", "print JSON")
  .option("--url <url>")
  .option("--key <key>")
  .action(async (options: CommonFlags & { json?: boolean }) => {
    const { url, apiKey } = await resolveCredentials(options);
    const client = new PocketClient(url, apiKey);
    const runs = await client.listRuns();

    if (options.json) {
      console.log(JSON.stringify(runs, null, 2));
      return;
    }

    if (runs.length === 0) {
      console.log(pc.dim("No runs yet."));
      return;
    }

    for (const run of runs) {
      const color =
        run.status === "completed"
          ? pc.green
          : run.status === "failed"
            ? pc.red
            : run.status === "running"
              ? pc.cyan
              : pc.yellow;
      const title = run.title ?? run.input ?? "(untitled)";
      console.log(
        `${color(run.status.padEnd(16))} ${pc.dim(run.id.slice(0, 8))}  ${title.slice(0, 70)}`,
      );
    }
  });

program
  .command("show")
  .description("Show one run and its final output.")
  .argument("<runId>")
  .option("--url <url>")
  .option("--key <key>")
  .action(async (runId: string, options: CommonFlags) => {
    const { url, apiKey } = await resolveCredentials(options);
    const client = new PocketClient(url, apiKey);
    const run = await client.getRun(runId);

    console.log(pc.bold(run.title ?? run.input ?? "Run"));
    console.log(pc.dim(`id ${run.id}`));
    console.log(pc.dim(`session ${run.sessionId}`));
    console.log(
      `status ${run.status} · step ${run.step}/${run.maxSteps} · ${run.tokensUsed.toLocaleString()} tokens · $${run.costUsd.toFixed(4)}`,
    );
    if (run.error) console.log(pc.red(`error: ${run.error}`));
    console.log();
    if (run.output) console.log(run.output);
    else console.log(pc.dim("(no assistant output yet)"));
  });

program
  .command("cancel")
  .description("Cancel a queued or running run.")
  .argument("<runId>")
  .option("--url <url>")
  .option("--key <key>")
  .action(async (runId: string, options: CommonFlags) => {
    const { url, apiKey } = await resolveCredentials(options);
    const client = new PocketClient(url, apiKey);
    await client.cancelRun(runId);
    console.log(pc.yellow("Cancellation requested."));
  });

program.parseAsync(process.argv).catch((error: unknown) => {
  console.error(pc.red(error instanceof Error ? error.message : String(error)));
  process.exitCode = 1;
});
