import { NextResponse, type NextRequest } from "next/server";
import { serverEnv } from "@pocket/shared/env";
import { tick } from "@/lib/worker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorised(request: NextRequest): boolean {
  const expected = serverEnv.cronSecret;
  if (!expected) return false;
  const header = request.headers.get("x-cron-secret");
  if (header && header === expected) return true;
  const auth = request.headers.get("authorization");
  return auth === `Bearer ${expected}`;
}

export async function GET(request: NextRequest) {
  if (!authorised(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const started = Date.now();
  await tick();
  return NextResponse.json({ ok: true, ms: Date.now() - started, at: new Date().toISOString() });
}

export async function POST(request: NextRequest) {
  return GET(request);
}
