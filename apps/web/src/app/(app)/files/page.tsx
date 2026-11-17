import { desc } from "drizzle-orm";
import { artifacts, getDb } from "@pocket/db";
import { PageHeader } from "@/components/ui";
import { FileBoard, type FileItem } from "@/components/file-board";

export const dynamic = "force-dynamic";

export default async function FilesPage() {
  const db = getDb();
  const rows = await db.select().from(artifacts).orderBy(desc(artifacts.updatedAt)).limit(200);

  const items: FileItem[] = rows.map((a) => ({
    id: a.id,
    path: a.path,
    name: a.name,
    mime: a.mime,
    size: a.size,
    kind: a.kind,
    runId: a.runId,
    updatedAt: a.updatedAt.toISOString(),
    preview: (a.content ?? "").slice(0, 8000),
  }));

  const totalBytes = items.reduce((sum, f) => sum + f.size, 0);

  return (
    <div>
      <PageHeader
        eyebrow="Workspace"
        title="Files"
        description="Everything the agent wrote or saved. The database always keeps a copy, so a storage outage never loses a deliverable."
        actions={
          <div className="flex items-center gap-2">
            <span className="chip chip-mint">{items.filter((f) => f.kind === "artifact").length} deliverables</span>
            <span className="chip">{items.length} files · {Math.round(totalBytes / 1024)} KB</span>
          </div>
        }
      />
      <FileBoard files={items} />
    </div>
  );
}
