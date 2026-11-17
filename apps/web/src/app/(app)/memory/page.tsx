import { desc, inArray } from "drizzle-orm";
import { getDb, memories } from "@pocket/db";
import { PageHeader } from "@/components/ui";
import { MemoryBoard, type MemoryItem } from "@/components/memory-board";

export const dynamic = "force-dynamic";

export default async function MemoryPage() {
  const db = getDb();
  const rows = await db
    .select()
    .from(memories)
    .where(inArray(memories.status, ["active", "pending"]))
    .orderBy(desc(memories.pinned), desc(memories.updatedAt))
    .limit(300);

  const items: MemoryItem[] = rows.map((m) => ({
    id: m.id,
    scope: m.scope,
    kind: m.kind,
    content: m.content,
    pinned: m.pinned,
    status: m.status,
    reason: m.reason,
    createdAt: m.createdAt.toISOString(),
  }));

  const pending = items.filter((m) => m.status === "pending").length;

  return (
    <div>
      <PageHeader
        eyebrow="Workspace"
        title="Memory"
        description="A small core memory that is always in the prompt, plus a large searchable archive. Nothing is written silently — proposals wait for your approval."
        actions={
          <div className="flex items-center gap-2">
            <span className="chip chip-lavender">{items.length - pending} active</span>
            <span className="chip chip-butter">{pending} pending</span>
          </div>
        }
      />
      <MemoryBoard memories={items} />
    </div>
  );
}
