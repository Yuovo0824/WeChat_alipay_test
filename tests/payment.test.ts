import { describe, it, expect } from "vitest";
import { getMockKeys, rsaSign, rsaVerify, aesGcmDecrypt, aesGcmEncrypt } from "@/lib/crypto";
import { randomBytes, createDecipheriv } from "node:crypto";

describe("RSA sign/verify", () => {
  it("signs and verifies with matching keys", () => {
    const keys = getMockKeys();
    const payload = "test payload\nwith newlines\n";
    const sig = rsaSign(payload, keys.wechatMerchantPrivate);
    expect(rsaVerify(payload, sig, keys.wechatPlatformPublic)).toBe(true);
  });

  it("verifies with correct public key", () => {
    // For mock Alipay, private and public are from same keypair
    const keys = getMockKeys();
    const payload = "param1=value1&param2=value2";
    const sig = rsaSign(payload, keys.alipayPrivate);
    expect(rsaVerify(payload, sig, keys.alipayPublic)).toBe(true);
  });

  it("rejects tampered payload", () => {
    const keys = getMockKeys();
    const sig = rsaSign("original payload", keys.alipayPrivate);
    expect(rsaVerify("tampered payload", sig, keys.alipayPublic)).toBe(false);
  });

  it("rejects wrong signature", () => {
    const keys = getMockKeys();
    const sig = rsaSign("payload", keys.alipayPrivate);
    // Flip a char in signature
    const badSig = sig.slice(0, -4) + "XXXX";
    expect(rsaVerify("payload", badSig, keys.alipayPublic)).toBe(false);
  });
});

describe("AES-256-GCM encrypt/decrypt", () => {
  it("round-trips correctly", () => {
    const key = randomBytes(32);
    const nonce = randomBytes(12);
    const plaintext = JSON.stringify({ out_trade_no: "test123", trade_state: "SUCCESS" });
    const aad = "transaction";
    const ct = aesGcmEncrypt(plaintext, aad, nonce, key);
    // Decode back
    const decoded = Buffer.from(ct, "base64");
    const tag = decoded.subarray(decoded.length - 16);
    const encrypted = decoded.subarray(0, decoded.length - 16);
    const decipher = createDecipheriv("aes-256-gcm", key, nonce);
    decipher.setAAD(Buffer.from(aad));
    decipher.setAuthTag(tag);
    const result = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    expect(JSON.parse(result.toString("utf8")).out_trade_no).toBe("test123");
  });

  it("decryption fails with wrong key", () => {
    const key = randomBytes(32);
    const wrongKey = randomBytes(32);
    const nonce = randomBytes(12);
    const plaintext = JSON.stringify({ test: true });
    const aad = "transaction";
    const ct = aesGcmEncrypt(plaintext, aad, nonce, key);
    expect(() => aesGcmDecrypt(ct, aad, nonce.toString("base64"), wrongKey)).toThrow();
  });

  it("decryption fails with tampered ciphertext", () => {
    const key = randomBytes(32);
    const nonce = randomBytes(12);
    const plaintext = JSON.stringify({ test: true });
    const aad = "transaction";
    const ct = aesGcmEncrypt(plaintext, aad, nonce, key);
    // Flip a bit
    const ctBytes = Buffer.from(ct, "base64");
    ctBytes[5] ^= 1;
    expect(() => aesGcmDecrypt(ctBytes.toString("base64"), aad, nonce.toString("base64"), key)).toThrow();
  });
});

describe("WeChat Pay mock notify", () => {
  it("builds a correctly signed and decryptable mock notify", () => {
    // Import the builder dynamically to avoid server-only issues
    const keys = getMockKeys();
    const apiV3Key = Buffer.from(keys.wechatApiV3Key, "hex");
    const nonce = randomBytes(12);
    const amount = 1;

    const plaintext = JSON.stringify({
      out_trade_no: "order_abc",
      transaction_id: "txn_123",
      trade_state: "SUCCESS",
      amount: { total: amount, currency: "CNY" },
      mchid: "mock_mch",
      appid: "mock_app",
    });

    const ciphertext = aesGcmEncrypt(plaintext, "transaction", nonce, apiV3Key);
    const resource = {
      original_type: "transaction",
      algorithm: "AEAD_AES_256_GCM",
      ciphertext,
      associated_data: "transaction",
      nonce: nonce.toString("base64"),
    };

    const body = JSON.stringify({
      id: randomBytes(16).toString("hex"),
      create_time: new Date().toISOString(),
      resource_type: "encrypt-resource",
      event_type: "TRANSACTION.SUCCESS",
      summary: "Payment success",
      resource,
    });

    const ts = Math.floor(Date.now() / 1000).toString();
    const nn = randomBytes(16).toString("hex");
    const sp = ts + "\n" + nn + "\n" + body + "\n";
    const sig = rsaSign(sp, keys.wechatMerchantPrivate);

    // Verify signature
    expect(rsaVerify(sp, sig, keys.wechatPlatformPublic)).toBe(true);

    // Decrypt
    const dec = aesGcmDecrypt(ciphertext, "transaction", nonce.toString("base64"), apiV3Key);
    const data = JSON.parse(dec.toString("utf8"));
    expect(data.out_trade_no).toBe("order_abc");
    expect(data.trade_state).toBe("SUCCESS");
    expect(data.amount.total).toBe(amount);
  });
});

describe("Alipay mock notify", () => {
  it("builds a correctly signed mock notify", () => {
    const keys = getMockKeys();
    const amount = 1;
    const totalAmount = (amount / 100).toFixed(2);
    const params: Record<string, string> = {
      notify_time: new Date().toISOString(),
      notify_type: "trade_status_sync",
      notify_id: "mock_notify_" + Date.now(),
      app_id: "mock_app",
      charset: "utf-8",
      version: "1.0",
      sign_type: "RSA2",
      trade_no: "mock_trade_" + Date.now(),
      out_trade_no: "order_abc",
      trade_status: "TRADE_SUCCESS",
      total_amount: totalAmount,
      buyer_id: "mock_buyer",
    };

    const signKeys = Object.keys(params)
      .filter((k) => k !== "sign" && k !== "sign_type" && params[k])
      .sort();
    const signStr = signKeys.map((k) => k + "=" + params[k]).join("&");
    params.sign = rsaSign(signStr, keys.alipayPrivate);

    // Verify
    const verifyKeys = Object.keys(params)
      .filter((k) => k !== "sign" && k !== "sign_type" && params[k])
      .sort();
    const verifyStr = verifyKeys.map((k) => k + "=" + params[k]).join("&");
    expect(rsaVerify(verifyStr, params.sign, keys.alipayPublic)).toBe(true);
  });

  it("rejects tampered amount in notify", () => {
    const keys = getMockKeys();
    const params: Record<string, string> = {
      out_trade_no: "order_xyz",
      trade_status: "TRADE_SUCCESS",
      total_amount: "0.01",
    };
    const signStr = Object.keys(params).sort().map((k) => k + "=" + params[k]).join("&");
    params.sign = rsaSign(signStr, keys.alipayPrivate);

    // Tamper amount
    params.total_amount = "100.00";
    const verifyStr = Object.keys(params)
      .filter((k) => k !== "sign" && k !== "sign_type" && params[k])
      .sort()
      .map((k) => k + "=" + params[k])
      .join("&");
    expect(rsaVerify(verifyStr, params.sign, keys.alipayPublic)).toBe(false);
  });
});
