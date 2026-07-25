/**
 * Credential vault crypto — AES-256-GCM.
 *
 * Key resolution order (most-secure first):
 *   1. CROSSTECCH_SECRET_KEY env var (recommended for production / serverless /
 *      container deployments — set this in your hosting provider's secret store)
 *   2. .crosstecch/secret.key file on disk (auto-generated on first run, used
 *      for local development; gitignore this file)
 *
 * Using env var removes the filesystem dependency and makes the key stable
 * across serverless cold starts (Vercel, AWS Lambda, etc.).
 *
 * Passwords are hashed with scrypt (Node built-in, no extra deps).
 */

import crypto from "crypto";
import fs from "fs";
import path from "path";

const SECRET_DIR = path.join(process.cwd(), ".crosstecch");
const SECRET_FILE = path.join(SECRET_DIR, "secret.key");

let cachedKey: Buffer | null = null;

export function getSecretKey(): Buffer {
  if (cachedKey) return cachedKey;

  // 1. Environment variable — preferred for production / serverless
  const envKey = process.env.CROSSTECCH_SECRET_KEY;
  if (envKey) {
    const buf = Buffer.from(envKey.trim(), "hex");
    if (buf.length !== 32) {
      throw new Error(
        "CROSSTECCH_SECRET_KEY must be a 64-character hex string (32 bytes). " +
        `Got ${buf.length} bytes. Generate one with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
      );
    }
    cachedKey = buf;
    return cachedKey;
  }

  // 2. Filesystem — local development fallback
  if (!fs.existsSync(SECRET_FILE)) {
    fs.mkdirSync(SECRET_DIR, { recursive: true });
    const newKey = crypto.randomBytes(32).toString("hex");
    fs.writeFileSync(SECRET_FILE, newKey, { mode: 0o600 });
    console.warn(
      "[crypto] Generated a new secret key at .crosstecch/secret.key. " +
      "For production, set CROSSTECCH_SECRET_KEY env var instead."
    );
  }
  cachedKey = Buffer.from(fs.readFileSync(SECRET_FILE, "utf8").trim(), "hex");
  return cachedKey;
}

// ── AES-256-GCM ──────────────────────────────────────────────────────────────

export function encrypt(plain: string): string {
  const key = getSecretKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}.${tag.toString("hex")}.${enc.toString("hex")}`;
}

export function decrypt(payload: string): string {
  const key = getSecretKey();
  const [ivH, tagH, dataH] = payload.split(".");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(ivH, "hex"));
  decipher.setAuthTag(Buffer.from(tagH, "hex"));
  return Buffer.concat([decipher.update(Buffer.from(dataH, "hex")), decipher.final()]).toString("utf8");
}

// ── Password hashing (scrypt) ────────────────────────────────────────────────

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  return `${salt.toString("hex")}.${hash.toString("hex")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [saltH, hashH] = stored.split(".");
  if (!saltH || !hashH) return false;
  const hash = crypto.scryptSync(password, Buffer.from(saltH, "hex"), 64);
  return crypto.timingSafeEqual(hash, Buffer.from(hashH, "hex"));
}

export function randomToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

// ── API key hashing (SHA-256) ────────────────────────────────────────────────
// API keys are high-entropy random tokens (24 bytes), so a fast deterministic
// hash gives safe storage while still allowing O(1) lookup-by-presented-key —
// unlike passwords, which need a salted/slow hash because they're low-entropy
// and guessable.

export function hashApiKey(rawKey: string): string {
  return crypto.createHash("sha256").update(rawKey).digest("hex");
}

export function genId(prefix: string): string {
  return `${prefix}-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`;
}
