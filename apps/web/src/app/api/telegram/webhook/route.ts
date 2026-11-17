import { NextResponse, type NextRequest } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { getDb, messages, runs, sessions } from "@pocket/db";
import { decideApproval, type ApprovalDecision } from "@/lib/approvals";
import { getChannels } from "@/lib/channels";
import {
  answerCallbackQuery,
  editTelegramMessage,
  sendTelegramMessage,
} from "@/lib/telegram";
import { kickWorker } from "@/lib/worker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

type TelegramUpdate = {
  message?: {
    message_id: number;
    from?: { id: number; first_name?: string; username?: string };
    chat: { id: number; type: string };
    text?: string;
  };
  callback_query?: {
    id: string;
    from?: { id: number };
    data?: string;
    message?: {
      message_id: number;
      chat: { id: number };
      text?: string;
    };
  };
};

const DECISIONS: ApprovalDecision[] = ["approved", "rejected"];

async function handleCallback(update: NonNullable<TelegramUpdate["callback_query"]>) {
  const call = update;
  const chatId = call.message?.chat.id;
  const messageId = call.message?.message_id;

  const [kind, decision, approvalId] = (call.data ?? "").split(":");
  if (
    kind !== "pa" ||
    !DECISIONS.includes(decision as ApprovalDecision) ||
    !approvalId
  ) {
    await answerCallbackQuery(call.id, "That button is not recognised.");
    return;
  }

  const result = await decideApproval(
    approvalId,
    decision as ApprovalDecision,
    "Decided from Telegram",
  );

  if (!result.ok) {
    await answerCallbackQuery(call.id, "This approval has already been handled.");
    return;
  }

  await answerCallbackQuery(call.id, decision === "approved" ? "Approved — continuing." : "Rejected.");
  if (chatId && messageId) {
    const original = call.message?.text ?? "Approval request";
    const footer =
      decision === "approved" ? "\n\n✅ Approved. Continuing." : "\n\n⛔ Rejected. The step was skipped.";
    await editTelegramMessage(chatId, messageId, original.slice(0, 3500) + footer);
  }
}

export async function POST(request: NextRequest) {
  const channels = await getChannels();
  const expected = channels.telegram.webhookSecret;
  if (expected) {
    const provided = request.headers.get("x-telegram-bot-api-secret-token");
    if (provided !== expected) {
      return NextResponse.json({ ok: false }, { status: 401 });
    }
  }

  let update: TelegramUpdate;
  try {
    update = (await request.json()) as TelegramUpdate;
  } catch {
    return NextResponse.json({ ok: true });
  }

  const senderId = update.message?.from?.id ?? update.callback_query?.from?.id;
  const chatId = update.message?.chat.id ?? update.callback_query?.message?.chat.id;

  const allowed = channels.telegram.allowedIds;
  if (allowed.length === 0) {
    if (chatId) {
      await sendTelegramMessage(
        chatId,
        "This bot is not configured yet. Add your Telegram user ID under Settings → Channels.",
      );
    }
    return NextResponse.json({ ok: true });
  }
  if (!senderId || !allowed.includes(senderId)) {
    if (chatId) await sendTelegramMessage(chatId, "You are not on the allowlist for this agent.");
    return NextResponse.json({ ok: true });
  }

  if (update.callback_query) {
    await handleCallback(update.callback_query);
    return NextResponse.json({ ok: true });
  }

  const message = update.message;
  if (!message?.text || !chatId) return NextResponse.json({ ok: true });

  const text = message.text.trim();
  const chatKey = String(chatId);

  if (text === "/start" || text === "/help") {
    await sendTelegramMessage(
      chatKey,
      "Pocket Agent is listening. Send a task and it will run on the server. Use /new to start a fresh session.",
    );
    return NextResponse.json({ ok: true });
  }

  const db = getDb();

  if (text === "/new") {
    await db.update(sessions).set({ archived: true }).where(eq(sessions.telegramChatId, chatKey));
    await sendTelegramMessage(chatKey, "Started a fresh session.");
    return NextResponse.json({ ok: true });
  }

  let [session] = await db
    .select()
    .from(sessions)
    .where(and(eq(sessions.telegramChatId, chatKey), eq(sessions.archived, false)))
    .orderBy(desc(sessions.updatedAt))
    .limit(1);

  if (!session) {
    const [created] = await db
      .insert(sessions)
      .values({
        title: text.slice(0, 60) || "Telegram",
        source: "telegram",
        telegramChatId: chatKey,
      })
      .returning();
    session = created;
  }

  await db.insert(messages).values({ sessionId: session.id, role: "user", content: text });

  await db.insert(runs).values({
    sessionId: session.id,
    status: "queued",
    input: text,
    source: "telegram",
    checkpoint: { delivery: "telegram", telegramChatId: chatKey },
  });

  await db.update(sessions).set({ updatedAt: new Date() }).where(eq(sessions.id, session.id));

  await sendTelegramMessage(chatKey, "On it. I'll send the result here when it's done.");
  kickWorker();

  return NextResponse.json({ ok: true });
}
