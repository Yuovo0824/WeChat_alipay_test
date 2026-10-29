import "server-only";
import { cookies } from "next/headers";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { ResponseCookie } from "next/dist/compiled/@edge-runtime/cookies";
import { getEnv } from "./env";

const SESSION_COOKIE = "session";
const OAUTH_STATE_COOKIE = "oauth_state";
const MAX_AGE = 7 * 24 * 60 * 60; // 7 days in seconds
const STATE_MAX_AGE = 600; // 10 minutes

interface SessionPayload {
  userId: string;
  exp: number;
}

function sign(payload: string): string {
  const secret = getEnv().SESSION_SECRET;
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

function verify(payload: string, signature: string): boolean {
  const expected = sign(payload);
  try {
    return timingSafeEqual(
      Buffer.from(expected),
      Buffer.from(signature)
    );
  } catch {
    return false;
  }
}

function encode(payload: SessionPayload): string {
  const json = JSON.stringify(payload);
  const b64 = Buffer.from(json).toString("base64url");
  const sig = sign(b64);
  return `${b64}.${sig}`;
}

function decode(token: string): SessionPayload | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payload, sig] = parts;
  if (!verify(payload, sig)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (typeof data.userId !== "string" || typeof data.exp !== "number") return null;
    if (Date.now() / 1000 > data.exp) return null;
    return data;
  } catch {
    return null;
  }
}

const cookieBase: Partial<ResponseCookie> = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  path: "/",
};

export async function createSession(userId: string) {
  const payload: SessionPayload = {
    userId,
    exp: Math.floor(Date.now() / 1000) + MAX_AGE,
  };
  const store = await cookies();
  store.set(SESSION_COOKIE, encode(payload), { ...cookieBase, maxAge: MAX_AGE });
}

export async function getSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return decode(token);
}

export async function clearSession() {
  const store = await cookies();
  store.set(SESSION_COOKIE, "", { ...cookieBase, maxAge: 0 });
}

/**
 * State cookies are scoped per provider so that starting a WeChat login and
 * an Alipay login from the same browser does not invalidate the first flow.
 */
function stateCookieName(provider: string): string {
  return `${OAUTH_STATE_COOKIE}_${provider}`;
}

export async function setOAuthState(provider: string): Promise<string> {
  const state = randomBytes(32).toString("hex");
  const store = await cookies();
  store.set(stateCookieName(provider), state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: STATE_MAX_AGE,
  });
  return state;
}

export async function validateOAuthState(
  provider: string,
  state: string | null
): Promise<boolean> {
  if (!state) return false;
  const store = await cookies();
  const name = stateCookieName(provider);
  const expected = store.get(name)?.value;
  if (!expected) return false;
  // Clear the state cookie after use
  store.set(name, "", { ...cookieBase, maxAge: 0 });
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(state));
  } catch {
    return false;
  }
}
