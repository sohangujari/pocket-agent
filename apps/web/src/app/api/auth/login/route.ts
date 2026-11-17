import { NextResponse, type NextRequest } from "next/server";
import { ensureBootstrap } from "@/lib/bootstrap";
import { passwordConfigured, setSessionCookie, verifyPassword } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  let body: { password?: string } = {};
  try {
    body = await request.json();
  } catch {
    /* empty body */
  }

  if (!(await passwordConfigured())) {
    return NextResponse.json(
      {
        error: "This dashboard has no password yet. Set one to continue.",
        setupRequired: true,
      },
      { status: 409 },
    );
  }

  if (!body.password || !(await verifyPassword(body.password))) {
    await new Promise((r) => setTimeout(r, 400));
    return NextResponse.json({ error: "Wrong password." }, { status: 401 });
  }

  await ensureBootstrap();
  await setSessionCookie();
  return NextResponse.json({ ok: true });
}
