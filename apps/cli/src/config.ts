import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export type CliConfig = {
  url?: string;
  apiKey?: string;
  sessionId?: string;
};

function configPath(): string {
  const base =
    process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), ".config");
  return path.join(base, "pocket-agent", "config.json");
}

export async function readConfig(): Promise<CliConfig> {
  try {
    const raw = await readFile(configPath(), "utf8");
    return JSON.parse(raw) as CliConfig;
  } catch {
    return {};
  }
}

export async function writeConfig(patch: Partial<CliConfig>): Promise<void> {
  const current = await readConfig();
  const next = { ...current, ...patch };
  const file = configPath();
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 });
}

export async function resolveCredentials(flags: {
  url?: string;
  key?: string;
}): Promise<{ url: string; apiKey: string }> {
  const config = await readConfig();
  const url = (flags.url ?? process.env.POCKET_URL ?? config.url ?? "http://localhost:3000")
    .replace(/\/+$/, "");
  const apiKey = flags.key ?? process.env.POCKET_API_KEY ?? config.apiKey ?? "";

  if (!apiKey) {
    throw new Error(
      "No API key. Create one in Settings → API keys, then run:\n" +
        "  pocket-agent login --url https://your-app.onrender.com --key pa_...",
    );
  }

  return { url, apiKey };
}
