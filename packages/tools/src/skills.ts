import { and, desc, eq, sql } from "drizzle-orm";
import {
  getDb,
  journeyEvents,
  skillUsage,
  skillVersions,
  skills,
} from "@pocket/db";
import { z } from "zod";
import { defineTool, slugify } from "./helpers.js";

export const skillList = defineTool({
  name: "skill_list",
  description: "List available skills with their one-line descriptions.",
  schema: z.object({
    includePending: z.boolean().default(false),
  }),
  risk: "safe",
  toolsets: ["skills"],
  label: "Listing skills",
  async run(input) {
    const db = getDb();
    const rows = await db
      .select({
        slug: skills.slug,
        name: skills.name,
        description: skills.description,
        version: skills.version,
        status: skills.status,
      })
      .from(skills)
      .where(
        input.includePending
          ? sql`${skills.status} in ('active','pending')`
          : eq(skills.status, "active"),
      )
      .orderBy(desc(skills.updatedAt))
      .limit(100);
    return { skills: rows };
  },
});

export const skillView = defineTool({
  name: "skill_view",
  description:
    "Load the full procedure for a skill. Always call this before following a skill — the index only contains names and descriptions.",
  schema: z.object({
    slug: z.string().min(1),
  }),
  risk: "safe",
  toolsets: ["skills"],
  label: "Loading a skill",
  async run(input, ctx) {
    const db = getDb();
    const [skill] = await db
      .select()
      .from(skills)
      .where(and(eq(skills.slug, input.slug), eq(skills.status, "active")))
      .limit(1);
    if (!skill) return { error: `Skill "${input.slug}" not found.` };

    await db.insert(skillUsage).values({
      skillId: skill.id,
      runId: ctx.runId,
      outcome: "used",
    });

    return {
      slug: skill.slug,
      name: skill.name,
      version: skill.version,
      description: skill.description,
      procedure: skill.bodyMd,
    };
  },
});

export const skillCreate = defineTool({
  name: "skill_create",
  description:
    "Create a reusable skill after completing a non-trivial procedure. The body must be a SKILL.md-style markdown document with 'When to use', 'Steps' and 'Pitfalls' sections. Keep it specific and executable.",
  schema: z.object({
    slug: z.string().min(2).max(60),
    name: z.string().min(2).max(80),
    description: z.string().min(8).max(200),
    body_md: z.string().min(80).max(12000),
    tags: z.array(z.string()).default([]),
    tools: z.array(z.string()).default([]),
  }),
  risk: "caution",
  toolsets: ["skills"],
  label: "Writing a skill",
  async run(input) {
    const db = getDb();
    const base = slugify(input.slug) || slugify(input.name);
    let slug = base;
    for (let i = 2; i < 20; i++) {
      const [exists] = await db.select({ id: skills.id }).from(skills).where(eq(skills.slug, slug)).limit(1);
      if (!exists) break;
      slug = `${base}-${i}`;
    }

    const [created] = await db
      .insert(skills)
      .values({
        slug,
        name: input.name,
        description: input.description,
        bodyMd: input.body_md,
        tags: input.tags,
        tools: input.tools,
        status: "active",
        enabled: true,
        version: 1,
        createdBy: "agent",
      })
      .returning({ id: skills.id });

    await db.insert(skillVersions).values({
      skillId: created.id,
      version: 1,
      bodyMd: input.body_md,
      changelog: "Initial version",
      createdBy: "agent",
    });

    await db.insert(journeyEvents).values({
      type: "skill_created",
      refId: created.id,
      summary: `Learned: ${input.name}`,
      meta: { slug },
    });

    return { created: true, slug, version: 1 };
  },
});

export const skillUpdate = defineTool({
  name: "skill_update",
  description:
    "Replace a skill's procedure with an improved version. Always increment the version and explain what changed. Use this after the user corrects the way you did something.",
  schema: z.object({
    slug: z.string().min(1),
    body_md: z.string().min(80).max(12000),
    changelog: z.string().min(3).max(300),
  }),
  risk: "caution",
  toolsets: ["skills"],
  label: "Improving a skill",
  async run(input) {
    const db = getDb();
    const [skill] = await db.select().from(skills).where(eq(skills.slug, input.slug)).limit(1);
    if (!skill) return { error: `Skill "${input.slug}" not found.` };

    const version = skill.version + 1;
    await db
      .update(skills)
      .set({ bodyMd: input.body_md, version, updatedAt: new Date() })
      .where(eq(skills.id, skill.id));

    await db.insert(skillVersions).values({
      skillId: skill.id,
      version,
      bodyMd: input.body_md,
      changelog: input.changelog,
      createdBy: "agent",
    });

    await db.insert(journeyEvents).values({
      type: "skill_improved",
      refId: skill.id,
      summary: `${skill.name} → v${version}`,
      meta: { changelog: input.changelog },
    });

    return { updated: true, version };
  },
});
