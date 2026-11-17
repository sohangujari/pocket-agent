import { and, desc, eq, like } from "drizzle-orm";
import { artifacts, getDb } from "@pocket/db";
import { LIMITS } from "@pocket/shared";
import { serverEnv } from "@pocket/shared/env";
import { z } from "zod";
import { defineTool, slugify } from "./helpers.js";
import { mirrorToStorage } from "./storage.js";

function normalisePath(input: string): string {
  let path = input.trim();
  if (!path.startsWith("/")) path = `/${path}`;
  if (path.includes("..")) throw new Error("Path traversal is not allowed.");
  path = path.replace(/\/+/g, "/");
  if (path.length > 240) throw new Error("Path is too long.");
  return path;
}

function fileName(path: string): string {
  return path.split("/").filter(Boolean).pop() ?? "file";
}

async function downloadFromStorage(storagePath: string): Promise<string | null> {
  const url = serverEnv.supabaseUrl;
  const key = serverEnv.supabaseServiceKey;
  if (!url || !key) return null;
  try {
    const res = await fetch(
      `${url}/storage/v1/object/${serverEnv.supabaseBucket}/${storagePath}`,
      { headers: { authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(15_000) },
    );
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

export const fileWrite = defineTool({
  name: "file_write",
  description:
    "Create or overwrite a text file in the workspace. Paths are virtual and stored in the database (mirrored to object storage when configured).",
  schema: z.object({
    path: z.string().min(1).describe("Absolute virtual path, e.g. /notes/plan.md"),
    content: z.string().max(LIMITS.maxFileBytes),
    mime: z.string().default("text/plain"),
  }),
  risk: "caution",
  toolsets: ["files"],
  label: "Writing a file",
  async run(input, ctx) {
    const db = getDb();
    const path = normalisePath(input.path);
    const size = Buffer.byteLength(input.content, "utf8");
    if (size > LIMITS.maxFileBytes) {
      throw new Error(`File is too large (${size} bytes, max ${LIMITS.maxFileBytes}).`);
    }

    const storagePath = await mirrorToStorage(path, input.content, input.mime);

    const [existing] = await db
      .select({ id: artifacts.id })
      .from(artifacts)
      .where(eq(artifacts.path, path))
      .limit(1);

    if (existing) {
      await db
        .update(artifacts)
        .set({
          content: input.content,
          size,
          mime: input.mime,
          storagePath,
          updatedAt: new Date(),
        })
        .where(eq(artifacts.id, existing.id));
    } else {
      await db.insert(artifacts).values({
        path,
        name: fileName(path),
        mime: input.mime,
        size,
        content: input.content,
        storagePath,
        runId: ctx.runId,
        kind: "file",
      });
    }

    return { written: true, path, size, storagePath };
  },
});

export const fileRead = defineTool({
  name: "file_read",
  description: "Read a text file from the workspace by its virtual path.",
  schema: z.object({
    path: z.string().min(1),
  }),
  risk: "safe",
  toolsets: ["files"],
  label: "Reading a file",
  async run(input) {
    const db = getDb();
    const path = normalisePath(input.path);
    const [row] = await db.select().from(artifacts).where(eq(artifacts.path, path)).limit(1);
    if (!row) return { error: `No file at ${path}` };

    let content = row.content;
    if (content == null && row.storagePath) {
      content = await downloadFromStorage(row.storagePath);
    }
    return {
      path,
      size: row.size,
      mime: row.mime,
      content: content ?? "(binary or empty file)",
      updatedAt: row.updatedAt,
    };
  },
});

export const fileList = defineTool({
  name: "file_list",
  description: "List workspace files, optionally under a path prefix.",
  schema: z.object({
    prefix: z.string().default("/"),
    limit: z.number().int().min(1).max(200).default(80),
  }),
  risk: "safe",
  toolsets: ["files"],
  label: "Listing files",
  async run(input) {
    const db = getDb();
    const prefix = normalisePath(input.prefix);
    const rows = await db
      .select({
        path: artifacts.path,
        size: artifacts.size,
        mime: artifacts.mime,
        updatedAt: artifacts.updatedAt,
      })
      .from(artifacts)
      .where(like(artifacts.path, `${prefix === "/" ? "" : prefix}%`))
      .orderBy(desc(artifacts.updatedAt))
      .limit(input.limit);
    return { files: rows };
  },
});

export const artifactSave = defineTool({
  name: "artifact_save",
  description:
    "Save a finished deliverable (report, table, code, notes) so the user can download it from the Files page. Use this for outputs the user will want to keep.",
  schema: z.object({
    name: z.string().min(1).max(120),
    content: z.string().max(LIMITS.maxFileBytes),
    mime: z.string().default("text/markdown"),
  }),
  risk: "safe",
  toolsets: ["files"],
  label: "Saving an artifact",
  async run(input, ctx) {
    const db = getDb();
    const ext = input.mime.includes("json")
      ? ".json"
      : input.mime.includes("csv")
        ? ".csv"
        : input.mime.includes("html")
          ? ".html"
          : input.mime.includes("markdown")
            ? ".md"
            : "";
    const slug = slugify(input.name.replace(/\.[a-z0-9]+$/i, "")) || "artifact";
    const path = `/artifacts/${Date.now()}-${slug}${ext}`;
    const size = Buffer.byteLength(input.content, "utf8");
    const storagePath = await mirrorToStorage(path, input.content, input.mime);

    await db.insert(artifacts).values({
      path,
      name: input.name,
      mime: input.mime,
      size,
      content: input.content,
      storagePath,
      runId: ctx.runId,
      kind: "artifact",
    });

    return { saved: true, path, name: input.name, size };
  },
});
