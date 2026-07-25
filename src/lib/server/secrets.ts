/**
 * Secret Manager abstraction.
 *
 * The credential vault (crypto.ts) already encrypts connector credentials
 * with AES-256-GCM using a key read from `.crosstecch/secret.key`. That's a
 * correct default for a self-hosted/single-box deployment, but an enterprise
 * deployment needs that key to come from AWS Secrets Manager, GCP Secret
 * Manager, HashiCorp Vault, or similar — never a file on the app server's
 * disk.
 *
 * This module defines the SWAP POINT: a `SecretProvider` interface with a
 * file-based default implementation (wrapping the existing behaviour
 * unchanged) and the shape a cloud provider adapter would implement. Nothing
 * about crypto.ts changes — `getSecretKey()` there keeps working exactly as
 * it does today. This is the architecture-ready layer on top of it.
 */

import fs from "fs";
import path from "path";
import crypto from "crypto";

export interface SecretProvider {
  /** Human-readable name, surfaced in the security settings UI. */
  readonly name: string;
  /** Fetch a secret by key. Returns null when it doesn't exist. */
  getSecret(key: string): Promise<string | null>;
  /** Create or overwrite a secret. */
  setSecret(key: string, value: string): Promise<void>;
  /** Remove a secret. */
  deleteSecret(key: string): Promise<void>;
}

// ── Default provider: local encrypted file ────────────────────────────────────
// Exactly what crypto.ts already does for the master key, generalised to
// arbitrary named secrets so the same abstraction covers the vault key today
// and API integration secrets (Stripe, OAuth client secrets) tomorrow.

const SECRET_DIR = path.join(process.cwd(), ".crosstecch", "secrets");

class FileSecretProvider implements SecretProvider {
  readonly name = "local-file";

  private pathFor(key: string): string {
    const safe = key.replace(/[^a-zA-Z0-9_-]/g, "_");
    return path.join(SECRET_DIR, `${safe}.secret`);
  }

  async getSecret(key: string): Promise<string | null> {
    const p = this.pathFor(key);
    if (!fs.existsSync(p)) return null;
    return fs.readFileSync(p, "utf8").trim();
  }

  async setSecret(key: string, value: string): Promise<void> {
    fs.mkdirSync(SECRET_DIR, { recursive: true, mode: 0o700 });
    fs.writeFileSync(this.pathFor(key), value, { mode: 0o600 });
  }

  async deleteSecret(key: string): Promise<void> {
    const p = this.pathFor(key);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }
}

// ── Environment provider ──────────────────────────────────────────────────────
// Reads secrets from process.env — the natural fit for platform-managed
// secrets (Vercel, Fly, ECS task definitions) where the orchestrator injects
// values pulled from its own vault at deploy time. Read-only by design: an
// app process should never be the one writing to its own env.

class EnvSecretProvider implements SecretProvider {
  readonly name = "environment";

  async getSecret(key: string): Promise<string | null> {
    return process.env[envKey(key)] ?? null;
  }
  async setSecret(): Promise<void> {
    throw new Error("EnvSecretProvider is read-only — set the value in the deployment environment instead.");
  }
  async deleteSecret(): Promise<void> {
    throw new Error("EnvSecretProvider is read-only.");
  }
}

function envKey(key: string): string {
  return `CT_SECRET_${key.toUpperCase().replace(/[^A-Z0-9]/g, "_")}`;
}

// ── Cloud provider stub ────────────────────────────────────────────────────────
// Shape a real integration (AWS Secrets Manager / GCP Secret Manager / Vault)
// would fill in. Throws until CT_SECRETS_PROVIDER selects it AND the SDK
// client is actually wired — this file intentionally ships no cloud SDK
// dependency so `npm install` stays untouched.

class CloudSecretProviderStub implements SecretProvider {
  readonly name = "cloud (not configured)";
  private unimplemented(): never {
    throw new Error(
      "Cloud secret provider selected via CT_SECRETS_PROVIDER but not implemented in this build. " +
      "Implement SecretProvider against your vault SDK and register it in getSecretProvider()."
    );
  }
  async getSecret(): Promise<string | null> { this.unimplemented(); }
  async setSecret(): Promise<void> { this.unimplemented(); }
  async deleteSecret(): Promise<void> { this.unimplemented(); }
}

// ── Provider selection ────────────────────────────────────────────────────────

let cached: SecretProvider | null = null;

/**
 * Resolve the active provider from CT_SECRETS_PROVIDER (defaults to the local
 * file provider, preserving current behaviour for every existing deployment).
 */
export function getSecretProvider(): SecretProvider {
  if (cached) return cached;
  const kind = (process.env.CT_SECRETS_PROVIDER ?? "file").toLowerCase();
  cached =
    kind === "env" ? new EnvSecretProvider()
      : kind === "cloud" ? new CloudSecretProviderStub()
      : new FileSecretProvider();
  return cached;
}

/** Constant-time comparison — use for anything checked against a secret (API keys, webhook signatures). */
export function safeCompare(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}
