import { getChannels } from "./channels";

function chunk(text: string, size: number): string[] {
  if (text.length <= size) return [text];
  const out: string[] = [];
  let rest = text;
  while (rest.length > 0) {
    out.push(rest.slice(0, size));
    rest = rest.slice(size);
  }
  return out;
}

export type TelegramButton = { text: string; data: string };

/** Inline keyboard rows built from callback buttons (data ≤ 64 bytes). */
export function inlineKeyboard(rows: TelegramButton[][]) {
  return {
    inline_keyboard: rows.map((row) => row.map((b) => ({ text: b.text, callback_data: b.data }))),
  };
}

export async function sendTelegramMessage(
  chatId: string | number,
  text: string,
  options: { replyMarkup?: unknown } = {},
): Promise<void> {
  const { token } = (await getChannels()).telegram;
  if (!token) return;
  const parts = chunk(text || "(empty)", 3900);
  for (const [index, part] of parts.entries()) {
    try {
      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: part,
          disable_web_page_preview: true,
          // The keyboard belongs to the last chunk only.
          reply_markup: index === parts.length - 1 ? options.replyMarkup : undefined,
        }),
        signal: AbortSignal.timeout(15_000),
      });
    } catch (error) {
      console.error("[telegram] send failed", error);
    }
  }
}

export async function editTelegramMessage(
  chatId: string | number,
  messageId: number,
  text: string,
): Promise<void> {
  const { token } = (await getChannels()).telegram;
  if (!token) return;
  try {
    await fetch(`https://api.telegram.org/bot${token}/editMessageText`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, message_id: messageId, text }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (error) {
    console.error("[telegram] edit failed", error);
  }
}

export async function answerCallbackQuery(callbackId: string, text: string): Promise<void> {
  const { token } = (await getChannels()).telegram;
  if (!token) return;
  try {
    await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ callback_query_id: callbackId, text }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    /* best effort: the button can stay unanswered without blocking the decision */
  }
}

export async function setTelegramWebhook(
  url: string,
): Promise<{ ok: boolean; description?: string }> {
  const { token, webhookSecret } = (await getChannels()).telegram;
  if (!token) return { ok: false, description: "No Telegram bot token is configured." };
  const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      url,
      secret_token: webhookSecret || undefined,
      // callback_query is required for the approval buttons.
      allowed_updates: ["message", "callback_query"],
      drop_pending_updates: true,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  return (await res.json()) as { ok: boolean; description?: string };
}
