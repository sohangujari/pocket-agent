import { NextResponse, type NextRequest } from "next/server";
import { auditLog, getDb } from "@pocket/db";
import { ensureBootstrap } from "@/lib/bootstrap";
import { needsSetup, setDashboardPassword, setSessionCookie } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MIN_LENGTH = 8;

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as {
    password?: string;
    confirm?: string;
  };

  // First-run only: never allow this to overwrite an existing password.
  if (!(await needsSetup())) {
    return NextResponse.json(
      { error: "A dashboard password is already set." },
      { status: 409 },
    );
  }

  const password = body.password ?? "";
  const confirm = body.confirm ?? "";

  if (password.length < MIN_LENGTH) {
    return NextResponse.json(
      { error: `Use at least ${MIN_LENGTH} characters.` },
      { status: 400 },
    );
  }
  if (password.length > 200) {
    return NextResponse.json({ error: "That password is too long." }, { status: 400 });
  }
  if (password !== confirm) {
    return NextResponse.json({ error: "The passwords do not match." }, { status: 400 });
  }
  if (/^\s+$/.test(password)) {
    return NextResponse.json({ error: "Use at least one non-space character." }, { status: 400 });
  }

  try {
    await ensureBootstrap();
    await setDashboardPassword(password);

    const db = getDb();
    await db.insert(auditLog).values({
      actor: "owner",
      action: "password_set",
      target: "dashboard",
    });
  } catch (error) {
    console.error("[setup]", error);
    return NextResponse.json(
      {
        error:
          "Could not save the password. Check that DATABASE_URL and AUTH_SECRET are configured, then try again.",
      },
      { status: 500 },
    );
  }

  await setSessionCookie();
  return NextResponse.json({ ok: true });
}
