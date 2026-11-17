import { NextResponse } from "next/server";
import { serverEnv } from "@pocket/shared/env";
import { getChannels } from "@/lib/channels";
import { setTelegramWebhook } from "@/lib/telegram";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Kept for CLI/scripts: Settings → Channels is the primary way to do this. */
export async function POST() {
  const { telegram } = await getChannels();
  if (!telegram.token) {
    return NextResponse.json(
      { ok: false, error: "No Telegram bot token is configured." },
      { status: 400 },
    );
  }

  const url = `${serverEnv.appUrl.replace(/\/+$/, "")}/api/telegram/webhook`;
  const result = await setTelegramWebhook(url);
  return NextResponse.json(
    { ...result, url },
    { status: result.ok ? 200 : 502 },
  );
}
