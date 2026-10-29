import { describe, it, expect, afterEach } from "vitest";
import { alipayAuthUrl } from "@/lib/alipay";

const BASE = {
  APP_URL: "https://example.com",
  SESSION_SECRET: "a".repeat(32),
  DATABASE_URL: "file:./dev.db",
  ALIPAY_APP_ID: "9021000170646159",
  ALIPAY_PRIVATE_KEY: "unused",
  ALIPAY_PUBLIC_KEY: "unused",
  ALIPAY_GATEWAY: "https://openapi-sandbox.dl.alipaydev.com/gateway.do",
} as const;

function setup(overrides: Record<string, string>) {
  Object.assign(process.env, BASE, overrides);
  process.env.WECHAT_LOGIN_MODE = "mock";
  process.env.WECHAT_PAY_MODE = "mock";
  process.env.ALIPAY_PAY_MODE = "mock";
}

describe("Alipay authorisation URL", () => {
  afterEach(() => {
    delete process.env.ALIPAY_LOGIN_MODE;
  });

  it("uses the sandbox authorisation host in sandbox mode", () => {
    setup({ ALIPAY_LOGIN_MODE: "sandbox" });
    const url = new URL(alipayAuthUrl("state123"));
    expect(url.host).toBe("openauth.alipaydev.com");
    expect(url.pathname).toBe("/oauth2/publicAppAuthorize.htm");
  });

  it("uses the production authorisation host in live mode", () => {
    setup({ ALIPAY_LOGIN_MODE: "live" });
    const url = new URL(alipayAuthUrl("state123"));
    expect(url.host).toBe("openauth.alipay.com");
  });

  it("carries app_id, redirect_uri, scope and state", () => {
    setup({ ALIPAY_LOGIN_MODE: "sandbox" });
    const url = new URL(alipayAuthUrl("abc"));
    expect(url.searchParams.get("app_id")).toBe("9021000170646159");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://example.com/api/auth/alipay/callback"
    );
    expect(url.searchParams.get("scope")).toBe("auth_user");
    expect(url.searchParams.get("state")).toBe("abc");
  });

  it("points at the local mock page in mock mode", () => {
    setup({ ALIPAY_LOGIN_MODE: "mock" });
    expect(alipayAuthUrl("abc")).toBe(
      "https://example.com/mock/alipay?state=abc"
    );
  });
});
