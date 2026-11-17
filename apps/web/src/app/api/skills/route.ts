import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { getDb, journeyEvents, skillVersions, skills } from "@pocket/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as {
    name?: string;
    slug?: string;
    description?: string;
    body_md?: string;
    tags?: string[];
  };

  const name = (body.name ?? "").trim();
  const description = (body.description ?? "").trim();
  const bodyMd = (body.body_md ?? "").trim();

  if (name.length < 2) {
    return NextResponse.json({ error: "Name must be at least 2 characters." }, { status: 400 });
  }
  if (description.length < 8) {
    return NextResponse.json(
      { error: "Description must say when to use the skill (8+ characters)." },
      { status: 400 },
    );
  }
  if (bodyMd.length < 40) {
    return NextResponse.json(
      { error: "The procedure needs at least a few lines of markdown." },
      { status: 400 },
    );
  }

  const db = getDb();
  const base = slugify(body.slug ?? "") || slugify(name) || `skill-${Date.now()}`;
  let slug = base;
  for (let i = 2; i < 50; i++) {
    const [exists] = await db.select({ id: skills.id }).from(skills).where(eq(skills.slug, slug)).limit(1);
    if (!exists) break;
    slug = `${base}-${i}`;
  }

  const [created] = await db
    .insert(skills)
    .values({
      slug,
      name,
      description,
      bodyMd,
      tags: Array.isArray(body.tags) ? body.tags.slice(0, 12) : [],
      status: "active",
      enabled: true,
      version: 1,
      createdBy: "user",
    })
    .returning({ id: skills.id });

  await db.insert(skillVersions).values({
    skillId: created.id,
    version: 1,
    bodyMd,
    changelog: "Created by the owner",
    createdBy: "user",
  });

  await db.insert(journeyEvents).values({
    type: "skill_created",
    refId: created.id,
    summary: `New skill: ${name}`,
    meta: { slug, by: "user" },
  });

  return NextResponse.json({ ok: true, id: created.id, slug });
}
