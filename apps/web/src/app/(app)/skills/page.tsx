import { desc, inArray } from "drizzle-orm";
import { getDb, skills } from "@pocket/db";
import { PageHeader } from "@/components/ui";
import { SkillBoard, type SkillItem } from "@/components/skill-board";

export const dynamic = "force-dynamic";

export default async function SkillsPage() {
  const db = getDb();
  const rows = await db
    .select()
    .from(skills)
    .where(inArray(skills.status, ["active", "pending"]))
    .orderBy(desc(skills.updatedAt))
    .limit(200);

  const items: SkillItem[] = rows.map((s) => ({
    id: s.id,
    slug: s.slug,
    name: s.name,
    description: s.description,
    bodyMd: s.bodyMd,
    tags: s.tags ?? [],
    enabled: s.enabled,
    status: s.status,
    version: s.version,
    createdBy: s.createdBy,
    updatedAt: s.updatedAt.toISOString(),
  }));

  const pending = items.filter((s) => s.status === "pending").length;

  return (
    <div>
      <PageHeader
        eyebrow="Workspace"
        title="Skills"
        description="Reusable procedures the agent writes for itself. They load on demand, so a long library costs almost nothing in the prompt."
        actions={
          <div className="flex items-center gap-2">
            <span className="chip chip-mint">{items.length - pending} active</span>
            <span className="chip chip-butter">{pending} proposed</span>
          </div>
        }
      />
      <SkillBoard skills={items} />
    </div>
  );
}
