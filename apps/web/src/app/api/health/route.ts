import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { getDb } from "@pocket/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const started = Date.now();
  try {
    const db = getDb();
    await db.execute(sql`select 1`);
    return NextResponse.json({
      ok: true,
      db: "up",
      latencyMs: Date.now() - started,
      time: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        db: "down",
        error: error instanceof Error ? error.message : "unknown",
      },
      { status: 503 },
    );
  }
}
