import { NextResponse, type NextRequest } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { getDb, messages, runs, sessions } from "@pocket/db";
import { decideApproval, type ApprovalDecision } from "@/lib/approvals";
import { getChannels } from "@/lib/channels";
import { verifyDiscordSignature } from "@/lib/discord";
import { kickWorker } from "@/lib/worker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

type DiscordInteraction = {
  id: string;
  type: number;
  application_id: string;
  token: string;
  channel_id?: string;
  member?: { user?: { id: string } };
  user?: { id: string };
  data?: {
    name?: string;
    custom_id?: string;
    options?: { name: string; value: string }[];
  };
  message?: { content?: string };
};

const EPHEMERAL = 1 << 6;
const DECISIONS: ApprovalDecision[] = ["approved", "rejected"];

function reply(content: string) {
  return NextResponse.json({ type: 4, data: { content, flags: EPHEMERAL } });
}

export async function POST(request: NextRequest) {
  const raw = await request.text();
  const channels = await getChannels();
  const publicKey = channels.discord.publicKey;

  const valid = verifyDiscordSignature(
    raw,
    request.headers.get("x-signature-ed25519"),
    request.headers.get("x-signature-timestamp"),
    publicKey,
  );
  if (!valid) {
    return NextResponse.json({ error: "Invalid request signature." }, { status: 401 });
  }

  let interaction: DiscordInteraction;
  try {
    interaction = JSON.parse(raw) as DiscordInteraction;
  } catch {
    return NextResponse.json({ error: "Malformed interaction." }, { status: 400 });
  }

  // 1 = PING: Discord's health check.
  if (interaction.type === 1) return NextResponse.json({ type: 1 });

  const userId = interaction.member?.user?.id ?? interaction.user?.id ?? "";
  const allowed = channels.discord.allowedIds;
  if (allowed.length === 0) {
    return reply("This bot is not configured yet. Add your Discord user ID under Settings → Channels.");
  }
  if (!userId || !allowed.includes(userId)) {
    return reply("You are not on the allowlist for this agent.");
  }

  const db = getDb();
  const channelId = interaction.channel_id ?? "dm";
  const chatKey = `discord:${channelId}:${userId}`;

  // 3 = MESSAGE_COMPONENT: the Approve / Reject buttons.
  if (interaction.type === 3) {
    const [kind, decision, approvalId] = (interaction.data?.custom_id ?? "").split(":");
    if (kind !== "pa" || !DECISIONS.includes(decision as ApprovalDecision) || !approvalId) {
      return reply("That button is not recognised.");
    }

    const result = await decideApproval(
      approvalId,
      decision as ApprovalDecision,
      "Decided from Discord",
    );
    if (!result.ok) return reply("This approval has already been handled.");

    const original = interaction.message?.content ?? "Approval request";
    const footer =
      decision === "approved" ? "\n\n✅ Approved. Continuing." : "\n\n⛔ Rejected. The step was skipped.";
    // 7 = UPDATE_MESSAGE; an empty component array strips the buttons.
    return NextResponse.json({
      type: 7,
      data: { content: original.slice(0, 1800) + footer, components: [] },
    });
  }

  if (interaction.type !== 2) return reply("Unsupported interaction.");

  const command = interaction.data?.name;

  if (command === "new") {
    await db
      .update(sessions)
      .set({ archived: true })
      .where(and(eq(sessions.channelChatId, chatKey), eq(sessions.archived, false)));
    return reply("Started a fresh session.");
  }

  if (command !== "ask") return reply("Unknown command.");

  const prompt = (interaction.data?.options ?? []).find((o) => o.name === "prompt")?.value?.trim();
  if (!prompt) return reply("Give me something to do, e.g. `/ask prompt: summarise my day`.");

  let [session] = await db
    .select()
    .from(sessions)
    .where(and(eq(sessions.channelChatId, chatKey), eq(sessions.archived, false)))
    .orderBy(desc(sessions.updatedAt))
    .limit(1);

  if (!session) {
    const [created] = await db
      .insert(sessions)
      .values({
        title: prompt.slice(0, 60) || "Discord",
        source: "discord",
        channelChatId: chatKey,
      })
      .returning();
    session = created;
  }

  await db.insert(messages).values({ sessionId: session.id, role: "user", content: prompt });

  await db.insert(runs).values({
    sessionId: session.id,
    status: "queued",
    input: prompt,
    source: "discord",
    checkpoint: {
      delivery: "discord",
      discordApplicationId: interaction.application_id,
      discordInteractionToken: interaction.token,
      discordChannelId: channelId,
      discordUserId: userId,
    },
  });

  await db.update(sessions).set({ updatedAt: new Date() }).where(eq(sessions.id, session.id));

  kickWorker();

  // 5 = DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE. The worker edits the original
  // response once the run finishes, which keeps us inside Discord's 3s budget.
  return NextResponse.json({ type: 5 });
}
