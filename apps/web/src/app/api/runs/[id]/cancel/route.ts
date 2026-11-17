import { NextResponse } from "next/server";
import { cancelRun } from "@pocket/core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  await cancelRun(id);
  return NextResponse.json({ ok: true });
}
