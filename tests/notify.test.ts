import { describe, it, expect } from "vitest";
import { buildMockWeChatNotify, wechatVerifyNotify } from "@/lib/wechat";
import { buildMockAlipayNotify, alipayVerifyNotify } from "@/lib/alipay";
import { rsaSign, getMockKeys } from "@/lib/crypto";

describe("WeChat Pay notification verification", () => {
  it("accepts a correctly signed and encrypted notification", async () => {
    const notify = buildMockWeChatNotify("order_1", 1);
    const data = await wechatVerifyNotify(notify.headers, notify.body);
    expect(data.outTradeNo).toBe("order_1");
    expect(data.tradeState).toBe("SUCCESS");
    expect(data.amount.total).toBe(1);
  });

  it("rejects a tampered signature", async () => {
    const notify = buildMockWeChatNotify("order_1", 1);
    const sig = notify.headers["wechatpay-signature"];
    notify.headers["wechatpay-signature"] = sig.slice(0, -6) + "AAAAAA";
    await expect(wechatVerifyNotify(notify.headers, notify.body)).rejects.toThrow(
      /signature verification failed/
    );
  });

  it("rejects a notification signed with the wrong key", async () => {
    const notify = buildMockWeChatNotify("order_1", 1);
    const ts = notify.headers["wechatpay-timestamp"];
    const nonce = notify.headers["wechatpay-nonce"];
    // Sign the same payload with an unrelated key pair
    const attacker = getMockKeys().alipayPrivate;
    notify.headers["wechatpay-signature"] = rsaSign(
      `${ts}\n${nonce}\n${notify.body}\n`,
      attacker
    );
    await expect(wechatVerifyNotify(notify.headers, notify.body)).rejects.toThrow(
      /signature verification failed/
    );
  });

  it("rejects when the encrypted amount is tampered with", async () => {
    const notify = buildMockWeChatNotify("order_1", 1);
    const parsed = JSON.parse(notify.body);
    // Flip bytes inside the ciphertext: AES-GCM auth tag must reject it
    const raw = Buffer.from(parsed.resource.ciphertext, "base64");
    raw[3] ^= 0xff;
    parsed.resource.ciphertext = raw.toString("base64");
    await expect(
      wechatVerifyNotify(notify.headers, JSON.stringify(parsed))
    ).rejects.toThrow();
  });

  it("rejects missing notify headers", async () => {
    const notify = buildMockWeChatNotify("order_1", 1);
    await expect(wechatVerifyNotify({}, notify.body)).rejects.toThrow(
      /Missing WeChat Pay notify headers/
    );
  });
});

describe("Alipay notification verification", () => {
  it("accepts a correctly RSA2-signed notification", () => {
    const notify = buildMockAlipayNotify("order_1", 1);
    const params = Object.fromEntries(new URLSearchParams(notify.body));
    const data = alipayVerifyNotify(params);
    expect(data.outTradeNo).toBe("order_1");
    expect(data.tradeStatus).toBe("TRADE_SUCCESS");
    expect(data.totalAmount).toBe("0.01");
  });

  it("rejects a notification whose amount was tampered with", () => {
    const notify = buildMockAlipayNotify("order_1", 1);
    const params = Object.fromEntries(new URLSearchParams(notify.body));
    params.total_amount = "999.00";
    expect(() => alipayVerifyNotify(params)).toThrow(
      /signature verification failed/
    );
  });

  it("rejects a notification with no signature", () => {
    const notify = buildMockAlipayNotify("order_1", 1);
    const params = Object.fromEntries(new URLSearchParams(notify.body));
    delete params.sign;
    expect(() => alipayVerifyNotify(params)).toThrow(/Missing sign/);
  });

  it("rejects a notification signed with the wrong key", () => {
    const notify = buildMockAlipayNotify("order_1", 1);
    const params = Object.fromEntries(new URLSearchParams(notify.body));
    params.sign = rsaSign(params.out_trade_no, getMockKeys().wechatMerchantPrivate);
    expect(() => alipayVerifyNotify(params)).toThrow(
      /signature verification failed/
    );
  });

  it("is idempotent-safe: the same notification verifies twice", () => {
    const notify = buildMockAlipayNotify("order_dup", 1);
    const params = Object.fromEntries(new URLSearchParams(notify.body));
    const first = alipayVerifyNotify(params);
    const second = alipayVerifyNotify(params);
    expect(first).toEqual(second);
  });
});
