import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";

function key(secret: string): Buffer {
  return createHash("sha256").update(secret).digest();
}

/** AES-256-GCM. Output: v1.<iv>.<tag>.<ciphertext> (base64url). */
export function encryptSecret(plain: string, secret: string): string {
  if (!secret) throw new Error("MASTER_KEY / AUTH_SECRET is required to encrypt secrets");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(secret), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv.toString("base64url"), tag.toString("base64url"), enc.toString("base64url")].join(".");
}

export function decryptSecret(payload: string, secret: string): string {
  const [version, ivB64, tagB64, dataB64] = payload.split(".");
  if (version !== "v1" || !ivB64 || !tagB64 || !dataB64) {
    throw new Error("Malformed encrypted secret");
  }
  const decipher = createDecipheriv("aes-256-gcm", key(secret), Buffer.from(ivB64, "base64url"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

export function maskSecret(value: string): string {
  if (!value) return "";
  if (value.length <= 8) return "••••••••";
  return `${value.slice(0, 3)}••••••••${value.slice(-4)}`;
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** Generate an API key like pa_ab12cd34... */
export function generateApiKey(): string {
  return `pa_${randomBytes(24).toString("base64url")}`;
}

/**
 * Owner password hashing (scrypt, per-password salt).
 * Stored form: scrypt$<salt base64url>$<hash base64url>
 */
export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  return `scrypt$${salt.toString("base64url")}$${hash.toString("base64url")}`;
}

export function verifyPasswordHash(password: string, stored: string): boolean {
  const [scheme, saltB64, hashB64] = stored.split("$");
  if (scheme !== "scrypt" || !saltB64 || !hashB64) return false;
  try {
    const expected = Buffer.from(hashB64, "base64url");
    const actual = scryptSync(password, Buffer.from(saltB64, "base64url"), expected.length);
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}
