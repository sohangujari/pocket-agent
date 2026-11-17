import { NextResponse } from "next/server";
import { loadChat } from "@/lib/chat";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const messages = await loadChat(id);
  return NextResponse.json({ messages });
}
