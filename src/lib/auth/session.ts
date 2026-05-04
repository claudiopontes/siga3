export const AUTH_COOKIE_NAME = "varadouro_session";

export type AuthSession = {
  username: string;
  displayName?: string;
  email?: string;
  groups: string[];
  expiresAt: number;
};

const encoder = new TextEncoder();

function getSecret() {
  const secret = process.env.AUTH_SESSION_SECRET;

  if (!secret) {
    throw new Error("AUTH_SESSION_SECRET nao configurado.");
  }

  return secret;
}

function base64UrlEncode(bytes: Uint8Array) {
  let binary = "";

  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecode(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes;
}

async function sign(value: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(getSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(value));

  return base64UrlEncode(new Uint8Array(signature));
}

function signaturesMatch(left: string, right: string) {
  const leftBytes = base64UrlDecode(left);
  const rightBytes = base64UrlDecode(right);

  if (leftBytes.length !== rightBytes.length) {
    return false;
  }

  let diff = 0;

  for (let i = 0; i < leftBytes.length; i += 1) {
    diff |= leftBytes[i] ^ rightBytes[i];
  }

  return diff === 0;
}

export async function createSessionToken(session: AuthSession) {
  const payload = base64UrlEncode(encoder.encode(JSON.stringify(session)));
  const signature = await sign(payload);

  return `${payload}.${signature}`;
}

export async function verifySessionToken(token?: string) {
  if (!token) {
    return null;
  }

  const [payload, signature] = token.split(".");

  if (!payload || !signature) {
    return null;
  }

  const expectedSignature = await sign(payload);

  if (!signaturesMatch(signature, expectedSignature)) {
    return null;
  }

  const session = JSON.parse(new TextDecoder().decode(base64UrlDecode(payload))) as AuthSession;

  if (!session.expiresAt || session.expiresAt <= Date.now()) {
    return null;
  }

  return session;
}
