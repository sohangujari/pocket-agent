import { NextResponse, type NextRequest } from "next/server";
import { serverEnv } from "@pocket/shared/env";
import {
  describeChannels,
  getChannels,
  saveChannel,
  type ChannelId,
} from "@/lib/channels";
import { registerDiscordCommands, sendDiscordMessage } from "@/lib/discord";
import { sendTelegramMessage, setTelegramWebhook } from "@/lib/telegram";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isChannel(value: unknown): value is ChannelId {
  return value === "telegram" || value === "discord";
}

export async function GET() {
  return NextResponse.json({ channels: await describeChannels() });
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as {
    channel?: string;
    action?: "save" | "register" | "test";
    token?: string;
    webhookSecret?: string;
    allowedIds?: string;
    applicationId?: string;
    publicKey?: string;
    clearToken?: boolean;
    clearWebhookSecret?: boolean;
    testChatId?: string;
  };

  if (!isChannel(body.channel)) {
    return NextResponse.json({ error: "Unknown channel." }, { status: 400 });
  }
  const channel = body.channel;
  const action = body.action ?? "save";

  try {
    if (action === "save") {
      await saveChannel(channel, {
        token: body.token,
        webhookSecret: body.webhookSecret,
        allowedIds: body.allowedIds,
        applicationId: body.applicationId,
        publicKey: body.publicKey,
        clearToken: body.clearToken,
        clearWebhookSecret: body.clearWebhookSecret,
      });
      const channels = await describeChannels();
      return NextResponse.json({ ok: true, channel: channels[channel] });
    }

    const resolved = await getChannels();

    if (action === "register") {
      if (channel === "telegram") {
        if (!resolved.telegram.token) {
          return NextResponse.json({ error: "Save a bot token first." }, { status: 400 });
        }
        const url = `${serverEnv.appUrl.replace(/\/+$/, "")}/api/telegram/webhook`;
        if (!url.startsWith("https://")) {
          return NextResponse.json(
            {
              error: `Telegram needs a public HTTPS URL, but APP_URL is ${serverEnv.appUrl}. Set APP_URL to your Render URL and redeploy.`,
            },
            { status: 400 },
          );
        }
        const result = await setTelegramWebhook(url);
        return NextResponse.json(
          { ok: result.ok, detail: result.description ?? `Webhook set to ${url}` },
          { status: result.ok ? 200 : 502 },
        );
      }

      if (!resolved.discord.token || !resolved.discord.applicationId) {
        return NextResponse.json(
          { error: "Save a bot token and application ID first." },
          { status: 400 },
        );
      }
      const result = await registerDiscordCommands(
        resolved.discord.applicationId,
        resolved.discord.token,
      );
      return NextResponse.json(result, { status: result.ok ? 200 : 502 });
    }

    // action === "test"
    const target = body.testChatId?.trim();

    if (channel === "telegram") {
      const chatId = target || String(resolved.telegram.allowedIds[0] ?? "");
      if (!chatId) {
        return NextResponse.json(
          { error: "Add an allowed user ID or a chat ID to send the test to." },
          { status: 400 },
        );
      }
      if (!resolved.telegram.token) {
        return NextResponse.json({ error: "Save a bot token first." }, { status: 400 });
      }
      await sendTelegramMessage(chatId, "Pocket Agent is connected. This is a test message.");
      return NextResponse.json({ ok: true, detail: `Test message sent to ${chatId}.` });
    }

    if (!target) {
      return NextResponse.json(
        { error: "Enter a Discord channel ID to send the test to." },
        { status: 400 },
      );
    }
    if (!resolved.discord.token) {
      return NextResponse.json({ error: "Save a bot token first." }, { status: 400 });
    }
    await sendDiscordMessage(target, "Pocket Agent is connected. This is a test message.");
    return NextResponse.json({ ok: true, detail: `Test message sent to ${target}.` });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Channel request failed." },
      { status: 500 },
    );
  }
}
