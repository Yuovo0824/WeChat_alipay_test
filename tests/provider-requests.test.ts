import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import path from "node:path";
import { exchangeAlipayCode, alipayCreatePcPay } from "@/lib/alipay";
import { wechatCreateNativePay } from "@/lib/wechat";
import { getMockKeys, rsaVerify } from "@/lib/crypto";

const keys = getMockKeys();
const WECHAT_MERCHANT_KEY_PATH = path.join(
  process.cwd(),
  ".mock",
  "keys",
  "wechat_merchant_private.pem"
);

let capturedUrl = "";
let capturedInit: RequestInit | null = null;

function stubFetch(jsonBody: unknown) {
  vi.stubGlobal("fetch", async (url: unknown, init?: RequestInit) => {
    capturedUrl = String(url);
    capturedInit = init ?? null;
    return new Response(JSON.stringify(jsonBody), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });
}

/** Alipay signs everything except `sign`, sorted by key, raw values. */
function alipayRequestSignContent(params: Record<string, string>): string {
  return Object.keys(params)
    .filter((k) => k !== "sign" && params[k] !== "")
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join("&");
}

describe("Alipay outgoing request signing", () => {
  beforeEach(() => {
    process.env.ALIPAY_LOGIN_MODE = "sandbox";
    process.env.ALIPAY_PAY_MODE = "sandbox";
    process.env.ALIPAY_APP_ID = "2021000000000000";
    process.env.ALIPAY_PRIVATE_KEY = keys.alipayPrivate;
    process.env.ALIPAY_PUBLIC_KEY = keys.alipayPublic;
    process.env.ALIPAY_GATEWAY = "https://example.invalid/gateway.do";
    process.env.ALIPAY_NOTIFY_URL = "https://example.com/api/pay/alipay/notify";
    process.env.ALIPAY_RETURN_URL = "https://example.com/orders";
    capturedUrl = "";
    capturedInit = null;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("signs the token exchange request with RSA2", async () => {
    stubFetch({
      alipay_system_oauth_token_response: {
        access_token: "tok",
        user_id: "2088000000000000",
        expires_in: 3600,
      },
    });

    await exchangeAlipayCode("auth_code_123");

    const params = Object.fromEntries(
      new URLSearchParams(String(capturedInit?.body))
    );
    expect(params.sign).toBeTruthy();
    expect(params.method).toBe("alipay.system.oauth.token");
    // Regression guard: the previous implementation forgot to sign at all.
    expect(
      rsaVerify(alipayRequestSignContent(params), params.sign, keys.alipayPublic)
    ).toBe(true);
  });

  it("sends grant_type and code as top-level parameters", async () => {
    stubFetch({
      alipay_system_oauth_token_response: {
        access_token: "tok",
        user_id: "2088",
        expires_in: 3600,
      },
    });

    await exchangeAlipayCode("auth_code_123");

    const params = Object.fromEntries(
      new URLSearchParams(String(capturedInit?.body))
    );
    // These belong at the top level for alipay.system.oauth.token,
    // not inside biz_content.
    expect(params.grant_type).toBe("authorization_code");
    expect(params.code).toBe("auth_code_123");
    expect(params.biz_content).toBeUndefined();
  });

  it("propagates a gateway error_response instead of returning a broken token", async () => {
    stubFetch({
      error_response: {
        code: "40002",
        msg: "Invalid Arguments",
        sub_code: "isv.invalid-app-id",
        sub_msg: "invalid app id",
      },
    });

    await expect(exchangeAlipayCode("bad")).rejects.toThrow(/invalid app id/);
  });

  it("signs the PC website payment redirect URL", () => {
    const url = alipayCreatePcPay("order_1", 1, "Test Item");
    expect(url.startsWith("https://example.invalid/gateway.do?")).toBe(true);

    const params = Object.fromEntries(
      new URLSearchParams(url.split("?")[1])
    );
    expect(params.method).toBe("alipay.trade.page.pay");
    const biz = JSON.parse(params.biz_content);
    expect(biz.out_trade_no).toBe("order_1");
    expect(biz.total_amount).toBe("0.01");
    expect(biz.product_code).toBe("FAST_INSTANT_TRADE_PAY");
    expect(
      rsaVerify(alipayRequestSignContent(params), params.sign, keys.alipayPublic)
    ).toBe(true);
  });
});

describe("WeChat Pay outgoing request signing", () => {
  beforeEach(() => {
    process.env.WECHAT_PAY_MODE = "live";
    process.env.WECHAT_PAY_MCH_ID = "1900000001";
    process.env.WECHAT_PAY_APP_ID = "wx1234567890";
    process.env.WECHAT_PAY_API_V3_KEY = "0123456789abcdef0123456789abcdef";
    process.env.WECHAT_PAY_CERT_SERIAL_NO = "ABCDEF123456";
    process.env.WECHAT_PAY_PRIVATE_KEY_PATH = WECHAT_MERCHANT_KEY_PATH;
    process.env.WECHAT_PAY_PLATFORM_PUBLIC_KEY_PATH = WECHAT_MERCHANT_KEY_PATH;
    process.env.WECHAT_PAY_NOTIFY_URL = "https://example.com/api/pay/wechat/notify";
    capturedUrl = "";
    capturedInit = null;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("calls the API v3 native endpoint with a valid signature header", async () => {
    stubFetch({ code_url: "weixin://wxpay/bizpayurl?pr=abc" });

    const result = await wechatCreateNativePay("order_1", 1, "Test Item");

    expect(capturedUrl).toBe(
      "https://api.mch.weixin.qq.com/v3/pay/transactions/native"
    );
    expect(result.codeUrl).toBe("weixin://wxpay/bizpayurl?pr=abc");

    const auth = String(
      (capturedInit?.headers as Record<string, string>).Authorization
    );
    expect(auth.startsWith("WECHATPAY2-SHA256-RSA2048 ")).toBe(true);

    const pick = (name: string) =>
      new RegExp(`${name}="([^"]+)"`).exec(auth)?.[1] as string;
    const timestamp = pick("timestamp");
    const nonce = pick("nonce_str");
    const signature = pick("signature");
    expect(pick("mchid")).toBe("1900000001");
    expect(pick("serial_no")).toBe("ABCDEF123456");

    // The signature must cover method\npath\ntimestamp\nnonce\nbody\n
    const signPayload = `POST\n/v3/pay/transactions/native\n${timestamp}\n${nonce}\n${String(
      capturedInit?.body
    )}\n`;
    expect(rsaVerify(signPayload, signature, keys.wechatPlatformPublic)).toBe(
      true
    );
  });
});
