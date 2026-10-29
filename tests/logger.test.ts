import { describe, it, expect, vi, afterEach } from "vitest";
import { log } from "@/lib/logger";

function capture(level: "info" | "warn" | "error", meta: Record<string, unknown>) {
  const spy = vi.spyOn(console, level).mockImplementation(() => {});
  log(level, "test message", meta);
  const output = spy.mock.calls[0][0] as string;
  spy.mockRestore();
  return JSON.parse(output) as Record<string, unknown>;
}

describe("Logger redaction", () => {
  afterEach(() => vi.restoreAllMocks());

  it("redacts secrets, tokens and signatures", () => {
    const out = capture("error", {
      app_secret: "super-secret-value",
      access_token: "tok_123",
      signature: "sig_abc",
      private_key: "-----BEGIN",
      api_v3_key: "0123456789abcdef",
    });
    expect(out.app_secret).toBe("[redacted]");
    expect(out.access_token).toBe("[redacted]");
    expect(out.signature).toBe("[redacted]");
    expect(out.private_key).toBe("[redacted]");
    expect(out.api_v3_key).toBe("[redacted]");
  });

  it("keeps provider error codes visible for debugging", () => {
    const out = capture("error", {
      code: "40002",
      sub_code: "isv.invalid-app-id",
      errcode: 40013,
      errmsg: "invalid appid",
    });
    expect(out.code).toBe("40002");
    expect(out.sub_code).toBe("isv.invalid-app-id");
    expect(out.errcode).toBe(40013);
    expect(out.errmsg).toBe("invalid appid");
  });

  it("redacts the OAuth auth code", () => {
    const out = capture("info", { auth_code: "abc123" });
    expect(out.auth_code).toBe("[redacted]");
  });

  it("always stamps a timestamp and level", () => {
    const out = capture("warn", {});
    expect(out.level).toBe("warn");
    expect(out.message).toBe("test message");
    expect(typeof out.ts).toBe("string");
  });

  it("redacts nested values too", () => {
    const out = capture("error", {
      provider: { access_token: "nested-tok", code: "E123" },
    });
    const nested = out.provider as Record<string, unknown>;
    expect(nested.access_token).toBe("[redacted]");
    expect(nested.code).toBe("E123");
  });
});
