import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { getDb, journeyEvents, skillVersions, skills } from "@pocket/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as {
    action?: "approve" | "reject" | "enable" | "disable" | "update";
    body_md?: string;
    description?: string;
    name?: string;
    changelog?: string;
  };

  const db = getDb();
  const [skill] = await db.select().from(skills).where(eq(skills.id, id)).limit(1);
  if (!skill) return NextResponse.json({ error: "Skill not found." }, { status: 404 });

  switch (body.action) {
    case "approve": {
      await db
        .update(skills)
        .set({ status: "active", enabled: true, updatedAt: new Date() })
        .where(eq(skills.id, id));
      await db.insert(journeyEvents).values({
        type: "skill_approved",
        refId: id,
        summary: `Approved: ${skill.name}`,
        meta: { slug: skill.slug },
      });
      return NextResponse.json({ ok: true });
    }

    case "reject": {
      await db
        .update(skills)
        .set({ status: "rejected", enabled: false, updatedAt: new Date() })
        .where(eq(skills.id, id));
      return NextResponse.json({ ok: true });
    }

    case "enable": {
      await db
        .update(skills)
        .set({ enabled: true, status: "active", updatedAt: new Date() })
        .where(eq(skills.id, id));
      return NextResponse.json({ ok: true });
    }

    case "disable": {
      await db
        .update(skills)
        .set({ enabled: false, updatedAt: new Date() })
        .where(eq(skills.id, id));
      return NextResponse.json({ ok: true });
    }

    case "update": {
      const bodyMd = (body.body_md ?? "").trim();
      if (bodyMd.length < 40) {
        return NextResponse.json({ error: "Procedure is too short." }, { status: 400 });
      }
      const version = skill.version + 1;
      await db
        .update(skills)
        .set({
          bodyMd,
          name: body.name?.trim().slice(0, 80) || skill.name,
          description: body.description?.trim().slice(0, 200) || skill.description,
          version,
          updatedAt: new Date(),
        })
        .where(eq(skills.id, id));

      await db.insert(skillVersions).values({
        skillId: id,
        version,
        bodyMd,
        changelog: body.changelog?.slice(0, 300) ?? "Edited by the owner",
        createdBy: "user",
      });

      await db.insert(journeyEvents).values({
        type: "skill_improved",
        refId: id,
        summary: `${skill.name} → v${version}`,
        meta: { by: "user" },
      });

      return NextResponse.json({ ok: true, version });
    }

    default:
      return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const db = getDb();
  await db.delete(skills).where(eq(skills.id, id));
  return NextResponse.json({ ok: true });
}
