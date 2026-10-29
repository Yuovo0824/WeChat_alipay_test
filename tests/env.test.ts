import { describe, it, expect, afterEach } from "vitest";
import { getEnv } from "@/lib/env";

const REQUIRED = {
  APP_URL: "http://localhost:3000",
  SESSION_SECRET: "a".repeat(32),
  DATABASE_URL: "file:./dev.db",
} as const;

const OPTIONAL_KEYS = [
  "WECHAT_APP_ID",
  "WECHAT_APP_SECRET",
  "WECHAT_PAY_MCH_ID",
  "WECHAT_PAY_APP_ID",
  "WECHAT_PAY_API_V3_KEY",
  "WECHAT_PAY_CERT_SERIAL_NO",
  "WECHAT_PAY_PRIVATE_KEY_PATH",
  "WECHAT_PAY_PLATFORM_PUBLIC_KEY_PATH",
  "WECHAT_PAY_NOTIFY_URL",
  "ALIPAY_APP_ID",
  "ALIPAY_PRIVATE_KEY",
  "ALIPAY_PUBLIC_KEY",
  "ALIPAY_GATEWAY",
  "ALIPAY_NOTIFY_URL",
  "ALIPAY_RETURN_URL",
] as const;

/** Reset to a valid all-mock baseline. */
function baseline(overrides: Record<string, string | undefined> = {}) {
  Object.assign(process.env, REQUIRED);
  process.env.WECHAT_LOGIN_MODE = "mock";
  process.env.WECHAT_PAY_MODE = "mock";
  process.env.ALIPAY_LOGIN_MODE = "mock";
  process.env.ALIPAY_PAY_MODE = "mock";
  for (const k of OPTIONAL_KEYS) delete process.env[k];
  for (const [k, v] of Object.entries(overrides)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

describe("Environment validation", () => {
  afterEach(() => baseline());

  it("throws if SESSION_SECRET is missing", () => {
    baseline({ SESSION_SECRET: undefined });
    expect(() => getEnv()).toThrow();
  });

  it("throws if SESSION_SECRET is too short", () => {
    baseline({ SESSION_SECRET: "short" });
    expect(() => getEnv()).toThrow(/SESSION_SECRET/);
  });

  it("throws if APP_URL is missing", () => {
    baseline({ APP_URL: undefined });
    expect(() => getEnv()).toThrow();
  });

  it("throws if a mode switch has an invalid value", () => {
    baseline({ WECHAT_LOGIN_MODE: "sandbox" }); // WeChat has no sandbox
    expect(() => getEnv()).toThrow();
  });

  it("passes with an all-mock configuration", () => {
    baseline();
    const env = getEnv();
    expect(env.APP_URL).toBe("http://localhost:3000");
    expect(env.WECHAT_LOGIN_MODE).toBe("mock");
    expect(env.ALIPAY_PAY_MODE).toBe("mock");
  });

  it("defaults every mode switch to mock when unset", () => {
    baseline();
    delete process.env.WECHAT_LOGIN_MODE;
    delete process.env.WECHAT_PAY_MODE;
    delete process.env.ALIPAY_LOGIN_MODE;
    delete process.env.ALIPAY_PAY_MODE;
    const env = getEnv();
    expect(env.WECHAT_LOGIN_MODE).toBe("mock");
    expect(env.WECHAT_PAY_MODE).toBe("mock");
    expect(env.ALIPAY_LOGIN_MODE).toBe("mock");
    expect(env.ALIPAY_PAY_MODE).toBe("mock");
  });

  it("requires WeChat login credentials when WECHAT_LOGIN_MODE is live", () => {
    baseline({ WECHAT_LOGIN_MODE: "live" });
    expect(() => getEnv()).toThrow(/WECHAT_APP_ID/);
  });

  it("accepts WeChat login credentials when WECHAT_LOGIN_MODE is live", () => {
    baseline({
      WECHAT_LOGIN_MODE: "live",
      WECHAT_APP_ID: "wx123",
      WECHAT_APP_SECRET: "secret",
    });
    const env = getEnv();
    expect(env.WECHAT_LOGIN_MODE).toBe("live");
  });

  it("keeps payments usable while only WeChat login goes live", () => {
    // This is the case a company account unlocks: real login, mock payments.
    baseline({
      WECHAT_LOGIN_MODE: "live",
      WECHAT_APP_ID: "wx123",
      WECHAT_APP_SECRET: "secret",
    });
    const env = getEnv();
    expect(env.WECHAT_PAY_MODE).toBe("mock");
    expect(env.ALIPAY_LOGIN_MODE).toBe("mock");
    expect(env.ALIPAY_PAY_MODE).toBe("mock");
  });

  it("requires every WeChat Pay credential when WECHAT_PAY_MODE is live", () => {
    baseline({ WECHAT_PAY_MODE: "live" });
    expect(() => getEnv()).toThrow(/WECHAT_PAY_/);
  });

  it("requires Alipay credentials when ALIPAY_LOGIN_MODE is sandbox", () => {
    baseline({ ALIPAY_LOGIN_MODE: "sandbox" });
    expect(() => getEnv()).toThrow(/ALIPAY_/);
  });

  it("requires Alipay notify URLs when ALIPAY_PAY_MODE is sandbox", () => {
    baseline({
      ALIPAY_PAY_MODE: "sandbox",
      ALIPAY_APP_ID: "2021000000000000",
      ALIPAY_PRIVATE_KEY: "-----BEGIN PRIVATE KEY-----",
      ALIPAY_PUBLIC_KEY: "-----BEGIN PUBLIC KEY-----",
      ALIPAY_GATEWAY: "https://openapi-sandbox.dl.alipaydev.com/gateway.do",
    });
    expect(() => getEnv()).toThrow(/ALIPAY_NOTIFY_URL/);
  });

  it("names the offending variable in the error message", () => {
    baseline({ WECHAT_LOGIN_MODE: "live" });
    try {
      getEnv();
      expect.unreachable("expected getEnv() to throw");
    } catch (e) {
      const msg = (e as Error).message;
      expect(msg).toContain("WECHAT_APP_ID");
      expect(msg).toContain("WECHAT_LOGIN_MODE is not mock");
    }
  });
});
