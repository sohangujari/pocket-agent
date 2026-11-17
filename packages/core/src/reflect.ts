import { and, desc, eq } from "drizzle-orm";
import {
  getDb,
  journeyEvents,
  memories,
  messages,
  runs,
  sessions,
  skillVersions,
  skills,
  usageLedger,
} from "@pocket/db";
import { serverEnv } from "@pocket/shared/env";
import { chat } from "./llm.js";
import { resolveModels } from "./models.js";

type Proposal = {
  memories?: {
    scope?: "user" | "agent";
    kind?: string;
    content?: string;
    reason?: string;
  }[];
  skill?: {
    slug?: string;
    name?: string;
    description?: string;
    body_md?: string;
  } | null;
};

function extractJson(text: string): Proposal | null {
  const cleaned = text
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

async function maybeTitle(sessionId: string, firstUserText: string): Promise<void> {
  const db = getDb();
  const [session] = await db.select().from(sessions).where(eq(sessions.id, sessionId)).limit(1);
  if (!session || session.title !== "New session") return;

  let title = firstUserText.trim().slice(0, 60);
  try {
    const chain = await resolveModels("fast");
    if (chain.length > 0) {
      const model = chain[0];
      const result = await chat({
        baseUrl: model.baseUrl,
        apiKey: model.apiKey,
        model: model.model,
        provider: model.provider,
        maxTokens: 40,
        messages: [
          {
            role: "system",
            content:
              "Write a 2-5 word title for the conversation. Plain text only, no quotes, no punctuation at the end.",
          },
          { role: "user", content: firstUserText.slice(0, 800) },
        ],
      });
      const candidate = result.content.replace(/["\n]/g, " ").trim();
      if (candidate.length >= 3 && candidate.length <= 70) title = candidate;
    }
  } catch {
    /* title is cosmetic */
  }

  if (title) {
    await db.update(sessions).set({ title }).where(eq(sessions.id, sessionId));
  }
}

export async function reflectRun(runId: string): Promise<void> {
  if (!serverEnv.learningEnabled) return;

  const db = getDb();
  const [run] = await db.select().from(runs).where(eq(runs.id, runId)).limit(1);
  if (!run || run.status !== "completed") return;

  const rows = await db
    .select()
    .from(messages)
    .where(eq(messages.sessionId, run.sessionId))
    .orderBy(desc(messages.seq))
    .limit(14);
  rows.reverse();

  const userText = rows.find((m) => m.role === "user")?.content ?? "";
  await maybeTitle(run.sessionId, userText || run.input || "New session");

  const transcript = rows
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => `${m.role.toUpperCase()}: ${(m.content ?? "").slice(0, 2500)}`)
    .join("\n\n")
    .slice(0, 9000);

  if (transcript.trim().length < 40) return;

  const existingMemories = await db
    .select({ content: memories.content })
    .from(memories)
    .where(eq(memories.status, "active"))
    .orderBy(desc(memories.updatedAt))
    .limit(40);

  const existingSkills = await db
    .select({ slug: skills.slug, description: skills.description })
    .from(skills)
    .limit(60);

  const chain = await resolveModels("review");
  if (chain.length === 0) return;

  const prompt = `You review a finished agent run and propose durable knowledge.

Return STRICT JSON only:
{
  "memories": [
    { "scope": "user" | "agent", "kind": "fact" | "preference" | "procedure" | "context",
      "content": "one sentence, self-contained, max 200 chars", "reason": "why it is durable" }
  ],
  "skill": null | {
    "slug": "kebab-case",
    "name": "Title",
    "description": "one line, when to use it",
    "body_md": "markdown procedure with When to use / Steps / Pitfalls sections"
  }
}

Rules:
- At most 3 memories. Empty array is the normal answer.
- Only durable, reusable facts or preferences. Never store secrets, tokens, passwords, one-off values or anything already known.
- "user" scope is for the owner's profile/preferences; "agent" scope is for lessons about how to do the work.
- Propose a skill ONLY if a non-trivial, repeatable procedure was completed successfully. Otherwise null.
- Never invent facts. If unsure, return fewer items.

Already known memories:
${existingMemories.map((m) => `- ${m.content}`).join("\n") || "(none)"}

Existing skills:
${existingSkills.map((s) => `- ${s.slug}: ${s.description}`).join("\n") || "(none)"}

Transcript:
${transcript}`;

  let proposal: Proposal | null = null;
  for (const model of chain) {
    try {
      const result = await chat({
        baseUrl: model.baseUrl,
        apiKey: model.apiKey,
        model: model.model,
        provider: model.provider,
        jsonMode: true,
        maxTokens: 1400,
        messages: [
          { role: "system", content: "You extract durable knowledge. Output JSON only." },
          { role: "user", content: prompt },
        ],
      });
      await db.insert(usageLedger).values({
        runId,
        provider: result.provider,
        model: result.model,
        role: "review",
        inputTokens: result.usage.inputTokens,
        outputTokens: result.usage.outputTokens,
        costUsd: result.usage.costUsd,
      });
      proposal = extractJson(result.content);
      if (proposal) break;
    } catch (error) {
      console.error("[reflect] model failed", error);
    }
  }

  if (!proposal) return;

  const known = new Set(existingMemories.map((m) => m.content.trim().toLowerCase()));

  for (const item of (proposal.memories ?? []).slice(0, 3)) {
    const content = (item.content ?? "").trim().slice(0, 240);
    if (content.length < 8) continue;
    if (known.has(content.toLowerCase())) continue;

    const [created] = await db
      .insert(memories)
      .values({
        scope: item.scope === "user" ? "user" : "agent",
        kind: item.kind ?? "fact",
        content,
        reason: item.reason?.slice(0, 300) ?? null,
        status: "pending",
        pinned: false,
        sourceRunId: runId,
      })
      .returning({ id: memories.id });

    await db.insert(journeyEvents).values({
      type: "memory_proposed",
      refId: created.id,
      summary: content.slice(0, 140),
      meta: { scope: item.scope ?? "agent" },
    });
  }

  const candidate = proposal.skill;
  if (candidate?.slug && candidate.body_md && candidate.body_md.length > 120) {
    const slug = slugify(candidate.slug);
    const [existing] = await db.select().from(skills).where(eq(skills.slug, slug)).limit(1);
    if (!existing && slug) {
      const [created] = await db
        .insert(skills)
        .values({
          slug,
          name: candidate.name?.slice(0, 80) ?? slug,
          description: candidate.description?.slice(0, 200) ?? "Learned procedure",
          bodyMd: candidate.body_md.slice(0, 12_000),
          status: "pending",
          enabled: false,
          createdBy: "agent",
        })
        .returning({ id: skills.id });

      await db.insert(skillVersions).values({
        skillId: created.id,
        version: 1,
        bodyMd: candidate.body_md.slice(0, 12_000),
        changelog: "Proposed by the learning loop",
        createdBy: "agent",
      });

      await db.insert(journeyEvents).values({
        type: "skill_proposed",
        refId: created.id,
        summary: `New skill: ${candidate.name ?? slug}`,
        meta: { slug },
      });
    }
  }
}
