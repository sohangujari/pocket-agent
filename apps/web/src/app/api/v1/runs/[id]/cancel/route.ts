import { NextResponse, type NextRequest } from "next/server";
import { cancelRun } from "@pocket/core";
import { authenticateApiKey, hasScope, unauthorized } from "@/lib/api-key";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const key = await authenticateApiKey(request);
  if (!key) return unauthorized();
  if (!hasScope(key, "run")) {
    return NextResponse.json({ error: { message: "Key lacks the run scope." } }, { status: 403 });
  }

  const { id } = await params;
  await cancelRun(id);
  return NextResponse.json({ ok: true });
}
