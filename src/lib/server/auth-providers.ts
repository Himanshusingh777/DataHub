/**
 * Auth-ready architecture — OAuth provider abstraction.
 *
 * Architecture only, exactly as scoped: this defines the shape every OAuth
 * provider (Google, GitHub, Microsoft) will implement and wires the
 * env-var contract, but does not perform a live OAuth handshake. The
 * existing email/password flow (api/auth/login, api/auth/register,
 * lib/server/crypto.ts, lib/server/auth.ts) is untouched and remains the
 * only *active* auth method — this module is the swap-in point for the
 * others once real client IDs/secrets are provisioned.
 *
 * Adding a provider for real, later, means: fill in the env vars below,
 * implement `exchangeCodeForProfile` with the provider's token endpoint,
 * and call `createSession()` from auth.ts with the resulting user id —
 * nothing else in the app needs to change, because sessions are already
 * provider-agnostic (a session is just a user_id + token, regardless of
 * how that user authenticated).
 */

export type AuthProviderId = "google" | "github" | "microsoft" | "email";

export interface OAuthProfile {
  providerId: AuthProviderId;
  externalId: string;
  email: string;
  name?: string;
  avatarUrl?: string;
}

export interface OAuthProvider {
  id: AuthProviderId;
  name: string;
  /** True only when the required env vars are present — never a hardcoded true. */
  enabled: boolean;
  /** Build the redirect URL to send the user to. Throws if not enabled. */
  getAuthorizationUrl(state: string, redirectUri: string): string;
  /** Exchange the callback `code` for a normalized profile. Throws if not enabled. */
  exchangeCodeForProfile(code: string, redirectUri: string): Promise<OAuthProfile>;
}

function envPair(clientIdKey: string, clientSecretKey: string): { id?: string; secret?: string; enabled: boolean } {
  const id = process.env[clientIdKey];
  const secret = process.env[clientSecretKey];
  return { id, secret, enabled: Boolean(id && secret) };
}

function notConfigured(name: string): never {
  throw new Error(`${name} OAuth is not configured — set the corresponding client id/secret env vars first.`);
}

// ── Google ───────────────────────────────────────────────────────────────
const googleEnv = envPair("GOOGLE_OAUTH_CLIENT_ID", "GOOGLE_OAUTH_CLIENT_SECRET");
export const googleProvider: OAuthProvider = {
  id: "google",
  name: "Google",
  enabled: googleEnv.enabled,
  getAuthorizationUrl(state, redirectUri) {
    if (!googleEnv.enabled) notConfigured("Google");
    const params = new URLSearchParams({
      client_id: googleEnv.id!, redirect_uri: redirectUri, response_type: "code",
      scope: "openid email profile", state,
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
  },
  async exchangeCodeForProfile() {
    // Real implementation point: POST to https://oauth2.googleapis.com/token
    // with { code, client_id, client_secret, redirect_uri, grant_type },
    // then GET https://openidconnect.googleapis.com/v1/userinfo with the
    // resulting access_token. Deliberately not called anywhere yet.
    if (!googleEnv.enabled) notConfigured("Google");
    throw new Error("Google OAuth token exchange not yet wired — architecture-only in this build.");
  },
};

// ── GitHub ───────────────────────────────────────────────────────────────
const githubEnv = envPair("GITHUB_OAUTH_CLIENT_ID", "GITHUB_OAUTH_CLIENT_SECRET");
export const githubProvider: OAuthProvider = {
  id: "github",
  name: "GitHub",
  enabled: githubEnv.enabled,
  getAuthorizationUrl(state, redirectUri) {
    if (!githubEnv.enabled) notConfigured("GitHub");
    const params = new URLSearchParams({
      client_id: githubEnv.id!, redirect_uri: redirectUri, scope: "read:user user:email", state,
    });
    return `https://github.com/login/oauth/authorize?${params}`;
  },
  async exchangeCodeForProfile() {
    // Real implementation point: POST https://github.com/login/oauth/access_token,
    // then GET https://api.github.com/user (+ /user/emails for the primary email).
    if (!githubEnv.enabled) notConfigured("GitHub");
    throw new Error("GitHub OAuth token exchange not yet wired — architecture-only in this build.");
  },
};

// ── Microsoft (Azure AD / Entra ID) ────────────────────────────────────────
const msEnv = envPair("MICROSOFT_OAUTH_CLIENT_ID", "MICROSOFT_OAUTH_CLIENT_SECRET");
const msTenant = process.env.MICROSOFT_OAUTH_TENANT ?? "common";
export const microsoftProvider: OAuthProvider = {
  id: "microsoft",
  name: "Microsoft",
  enabled: msEnv.enabled,
  getAuthorizationUrl(state, redirectUri) {
    if (!msEnv.enabled) notConfigured("Microsoft");
    const params = new URLSearchParams({
      client_id: msEnv.id!, redirect_uri: redirectUri, response_type: "code",
      scope: "openid email profile", state,
    });
    return `https://login.microsoftonline.com/${msTenant}/oauth2/v2.0/authorize?${params}`;
  },
  async exchangeCodeForProfile() {
    // Real implementation point: POST to
    // https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token, then
    // GET https://graph.microsoft.com/v1.0/me with the access_token.
    if (!msEnv.enabled) notConfigured("Microsoft");
    throw new Error("Microsoft OAuth token exchange not yet wired — architecture-only in this build.");
  },
};

const PROVIDERS: Record<Exclude<AuthProviderId, "email">, OAuthProvider> = {
  google: googleProvider,
  github: githubProvider,
  microsoft: microsoftProvider,
};

export function getOAuthProvider(id: Exclude<AuthProviderId, "email">): OAuthProvider {
  return PROVIDERS[id];
}

/** What the login page should render — email/password is always available. */
export function listAuthProviders(): { id: AuthProviderId; name: string; enabled: boolean }[] {
  return [
    { id: "email", name: "Email", enabled: true },
    ...Object.values(PROVIDERS).map((p) => ({ id: p.id, name: p.name, enabled: p.enabled })),
  ];
}
