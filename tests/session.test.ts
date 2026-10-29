import { describe, it, expect } from "vitest";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

// Test the session signing and verification logic in isolation.
// These test the crypto primitives used by session.ts.

const SESSION_SECRET = "test-secret-at-least-32-chars-long!";
const MAX_AGE = 7 * 24 * 60 * 60;

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

function verify(payload: string, signature: string, secret: string): boolean {
  const expected = sign(payload, secret);
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

function encodeSession(userId: string, secret: string): string {
  const payload = JSON.stringify({
    userId,
    exp: Math.floor(Date.now() / 1000) + MAX_AGE,
  });
  const b64 = Buffer.from(payload).toString("base64url");
  const sig = sign(b64, secret);
  return `${b64}.${sig}`;
}

function decodeSession(token: string, secret: string): { userId: string } | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payload, sig] = parts;
  if (!verify(payload, sig, secret)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (typeof data.userId !== "string" || typeof data.exp !== "number") return null;
    if (Date.now() / 1000 > data.exp) return null;
    return { userId: data.userId };
  } catch {
    return null;
  }
}

describe("Session token", () => {
  it("encodes and decodes a valid session", () => {
    const token = encodeSession("user_abc", SESSION_SECRET);
    const decoded = decodeSession(token, SESSION_SECRET);
    expect(decoded).not.toBeNull();
    expect(decoded!.userId).toBe("user_abc");
  });

  it("rejects a tampered token (wrong signature)", () => {
    const token = encodeSession("user_abc", SESSION_SECRET);
    const parts = token.split(".");
    // Flip a bit in the payload
    const flippedPayload = Buffer.from(parts[0], "base64url");
    flippedPayload[0] ^= 1;
    const badToken = flippedPayload.toString("base64url") + "." + parts[1];
    const decoded = decodeSession(badToken, SESSION_SECRET);
    expect(decoded).toBeNull();
  });

  it("rejects a token with wrong secret", () => {
    const token = encodeSession("user_abc", SESSION_SECRET);
    const decoded = decodeSession(token, "different-secret-at-least-32-chars!!");
    expect(decoded).toBeNull();
  });

  it("rejects an expired token", () => {
    // Create an already-expired payload
    const payload = JSON.stringify({
      userId: "user_abc",
      exp: Math.floor(Date.now() / 1000) - 1, // 1 second ago
    });
    const b64 = Buffer.from(payload).toString("base64url");
    const sig = sign(b64, SESSION_SECRET);
    const token = `${b64}.${sig}`;
    const decoded = decodeSession(token, SESSION_SECRET);
    expect(decoded).toBeNull();
  });

  it("rejects a malformed token (no dot)", () => {
    expect(decodeSession("justonestring", SESSION_SECRET)).toBeNull();
  });

  it("rejects a token with invalid JSON in payload", () => {
    const b64 = Buffer.from("not-json!!!").toString("base64url");
    const sig = sign(b64, SESSION_SECRET);
    const token = `${b64}.${sig}`;
    const decoded = decodeSession(token, SESSION_SECRET);
    expect(decoded).toBeNull();
  });
});

describe("OAuth state validation", () => {
  it("verifies matching states with timing-safe compare", () => {
    const state = randomBytes(32).toString("hex");
    expect(
      timingSafeEqual(Buffer.from(state), Buffer.from(state))
    ).toBe(true);
  });

  it("rejects mismatched states", () => {
    const expected = randomBytes(32).toString("hex");
    const actual = randomBytes(32).toString("hex");
    // They might accidentally match, but probability is negligible
    if (expected === actual) return; // skip in astronomically unlikely case
    const result = timingSafeEqual(Buffer.from(expected), Buffer.from(actual));
    expect(result).toBe(false);
  });

  it("rejects empty state", () => {
    const empty = "";
    const state = randomBytes(32).toString("hex");
    // timingSafeEqual throws on different-length buffers; test this case separately
    expect(empty.length).not.toBe(state.length);
    let threw = false;
    try {
      timingSafeEqual(Buffer.from(empty), Buffer.from(state));
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
  });

  it("rejects null state (different lengths)", () => {
    const a = randomBytes(16).toString("hex");
    const b = randomBytes(32).toString("hex");
    // Different lengths always mismatch
    expect(a.length).not.toBe(b.length);
    let threw2 = false;
    try {
      timingSafeEqual(Buffer.from(a), Buffer.from(b));
    } catch {
      threw2 = true;
    }
    expect(threw2).toBe(true);
  });
});

describe("Session HMAC", () => {
  it("same payload with same secret produces same signature", () => {
    const payload = "test-payload";
    const sig1 = sign(payload, SESSION_SECRET);
    const sig2 = sign(payload, SESSION_SECRET);
    expect(sig1).toBe(sig2);
  });

  it("different secrets produce different signatures for same payload", () => {
    const payload = "test-payload";
    const sig1 = sign(payload, SESSION_SECRET);
    const sig2 = sign(payload, "other-secret-at-least-32-chars-long!!");
    expect(sig1).not.toBe(sig2);
  });
});
