import { createHash, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import { getSetting, setSetting } from "@pocket/core";
import { serverEnv } from "@pocket/shared/env";
import { hashPassword, verifyPasswordHash } from "@pocket/shared/crypto";

export const SESSION_COOKIE = "pa_session";
export const PASSWORD_SETTING_KEY = "owner_password_hash";
const THIRTY_DAYS = 60 * 60 * 24 * 30;

function secretKey(): Uint8Array {
  const secret = serverEnv.authSecret;
  if (!secret) {
    throw new Error(
      "AUTH_SECRET is not set. Generate one with `openssl rand -base64 32` and add it to your environment.",
    );
  }
  return new TextEncoder().encode(secret);
}

/** The owner password can live in the database (first-run setup) or in the environment. */
export type PasswordState = "database" | "environment" | "none";

export async function passwordState(): Promise<PasswordState> {
  try {
    const stored = await getSetting<string>(PASSWORD_SETTING_KEY, "");
    if (stored && stored.startsWith("scrypt$")) return "database";
  } catch {
    // Database not reachable yet; fall back to the environment.
  }
  return serverEnv.ownerPassword ? "environment" : "none";
}

export async function needsSetup(): Promise<boolean> {
  return (await passwordState()) === "none";
}

export async function passwordConfigured(): Promise<boolean> {
  return (await passwordState()) !== "none";
}

function constantTimeEquals(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

export async function verifyPassword(input: string): Promise<boolean> {
  try {
    const stored = await getSetting<string>(PASSWORD_SETTING_KEY, "");
    if (stored && stored.startsWith("scrypt$")) {
      return verifyPasswordHash(input, stored);
    }
  } catch {
    // fall through to the environment password
  }
  const expected = serverEnv.ownerPassword;
  if (!expected) return false;
  return constantTimeEquals(input, expected);
}

/** Only used by first-run setup and the change-password route. */
export async function setDashboardPassword(password: string): Promise<void> {
  await setSetting(PASSWORD_SETTING_KEY, hashPassword(password));
}

export async function createSessionToken(): Promise<string> {
  return new SignJWT({ role: "owner" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(secretKey());
}

export async function verifyToken(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  try {
    await jwtVerify(token, secretKey());
    return true;
  } catch {
    return false;
  }
}

export async function getSession() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  const ok = await verifyToken(token);
  return ok ? { role: "owner" as const } : null;
}

export async function requireSession() {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}

export async function setSessionCookie() {
  const store = await cookies();
  store.set(SESSION_COOKIE, await createSessionToken(), {
    httpOnly: true,
    sameSite: "lax",
    // Secure only when the app is actually served over HTTPS. This keeps
    // localhost and LAN testing over plain HTTP working.
    secure: serverEnv.appUrl.startsWith("https://"),
    path: "/",
    maxAge: THIRTY_DAYS,
  });
}

export async function clearSessionCookie() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}
