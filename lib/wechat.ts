import "server-only";
import { randomBytes } from "node:crypto";
import * as fs from "node:fs";
import { getEnv } from "./env";
import { prisma } from "./db";
import { log } from "./logger";
import { getMockKeys, rsaSign, rsaVerify, aesGcmDecrypt, aesGcmEncrypt } from "./crypto";

// ---------------------------------------------------------------------------
// Login (WeChat Open Platform, website application)
// ---------------------------------------------------------------------------

interface WeChatUserInfo {
  provider: "wechat";
  providerId: string;
  unionId?: string;
  nickname?: string;
  avatar?: string;
}

interface WeChatToken {
  access_token: string;
  refresh_token: string;
  openid: string;
  unionid?: string;
  expires_in: number;
}

export function wechatAuthUrl(state: string): string {
  const env = getEnv();
  if (env.WECHAT_LOGIN_MODE === "mock") {
    return `${env.APP_URL}/mock/wechat?state=${encodeURIComponent(state)}`;
  }
  const params = new URLSearchParams({
    appid: env.WECHAT_APP_ID!,
    redirect_uri: `${env.APP_URL}/api/auth/wechat/callback`,
    response_type: "code",
    scope: "snsapi_login",
    state,
  });
  return `https://open.weixin.qq.com/connect/qrconnect?${params.toString()}#wechat_redirect`;
}

export async function exchangeWeChatCode(code: string): Promise<WeChatToken> {
  const env = getEnv();
  if (env.WECHAT_LOGIN_MODE === "mock") {
    throw new Error("exchangeWeChatCode() must not be called in mock mode");
  }
  const url =
    `https://api.weixin.qq.com/sns/oauth2/access_token` +
    `?appid=${env.WECHAT_APP_ID}&secret=${env.WECHAT_APP_SECRET}` +
    `&code=${encodeURIComponent(code)}&grant_type=authorization_code`;
  const res = await fetch(url);
  const body = await res.json();
  if (body.errcode) {
    log("error", "WeChat token exchange failed", {
      errcode: body.errcode,
      errmsg: body.errmsg,
    });
    throw new Error(`WeChat token exchange failed: ${body.errmsg}`);
  }
  return body as WeChatToken;
}

export async function fetchWeChatUserInfo(
  accessToken: string,
  openid: string
): Promise<WeChatUserInfo> {
  const url =
    `https://api.weixin.qq.com/sns/userinfo` +
    `?access_token=${encodeURIComponent(accessToken)}&openid=${encodeURIComponent(openid)}`;
  const res = await fetch(url);
  const body = await res.json();
  if (body.errcode) {
    log("error", "WeChat userinfo failed", {
      errcode: body.errcode,
      errmsg: body.errmsg,
    });
    throw new Error(`WeChat userinfo failed: ${body.errmsg}`);
  }
  return {
    provider: "wechat",
    providerId: body.openid,
    unionId: body.unionid,
    nickname: body.nickname,
    avatar: body.headimgurl,
  };
}

export async function loginOrCreateWeChatUser(
  userInfo: WeChatUserInfo
): Promise<string> {
  const user = await prisma.user.upsert({
    where: {
      provider_providerId: {
        provider: "wechat",
        providerId: userInfo.providerId,
      },
    },
    update: {
      nickname: userInfo.nickname,
      avatar: userInfo.avatar,
      unionId: userInfo.unionId ?? undefined,
    },
    create: {
      provider: "wechat",
      providerId: userInfo.providerId,
      nickname: userInfo.nickname,
      avatar: userInfo.avatar,
      unionId: userInfo.unionId,
    },
  });
  return user.id;
}

export function mockWeChatUser(id: string): WeChatUserInfo {
  return {
    provider: "wechat",
    providerId: `mock_wx_${id}`,
    unionId: `mock_union_${id}`,
    nickname: `WeChatUser_${id}`,
    avatar: "",
  };
}

// ---------------------------------------------------------------------------
// Payment (WeChat Pay API v3, Native)
// ---------------------------------------------------------------------------

export async function wechatCreateNativePay(
  outTradeNo: string,
  amount: number,
  description: string
): Promise<{ codeUrl: string; providerTradeNo: string }> {
  const env = getEnv();

  if (env.WECHAT_PAY_MODE === "mock") {
    const mockPr = randomBytes(16).toString("hex");
    return {
      codeUrl: `weixin://wxpay/bizpayurl?pr=${mockPr}`,
      providerTradeNo: `mock_wxpay_${outTradeNo}`,
    };
  }

  const body = JSON.stringify({
    appid: env.WECHAT_PAY_APP_ID!,
    mchid: env.WECHAT_PAY_MCH_ID!,
    description,
    out_trade_no: outTradeNo,
    notify_url: env.WECHAT_PAY_NOTIFY_URL!,
    amount: { total: amount, currency: "CNY" },
  });

  const method = "POST";
  const apiPath = "/v3/pay/transactions/native";
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = randomBytes(16).toString("hex");
  const signPayload = `${method}\n${apiPath}\n${timestamp}\n${nonce}\n${body}\n`;
  const privateKey = fs.readFileSync(env.WECHAT_PAY_PRIVATE_KEY_PATH!, "utf8");
  const signature = rsaSign(signPayload, privateKey);

  const authorization =
    `WECHATPAY2-SHA256-RSA2048 ` +
    `mchid="${env.WECHAT_PAY_MCH_ID}",nonce_str="${nonce}",timestamp="${timestamp}",` +
    `serial_no="${env.WECHAT_PAY_CERT_SERIAL_NO}",signature="${signature}"`;

  const res = await fetch(
    "https://api.mch.weixin.qq.com/v3/pay/transactions/native",
    {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: authorization,
        Accept: "application/json",
      },
      body,
    }
  );
  const data = await res.json();
  if (!res.ok) {
    log("error", "WeChat Pay native failed", data);
    throw new Error(
      `WeChat Pay native failed: ${data.message || JSON.stringify(data)}`
    );
  }
  return { codeUrl: data.code_url, providerTradeNo: outTradeNo };
}

export async function wechatVerifyNotify(
  headers: Record<string, string | null>,
  rawBody: string
): Promise<{
  outTradeNo: string;
  transactionId: string;
  tradeState: string;
  amount: { total: number };
}> {
  const env = getEnv();
  const timestamp = headers["wechatpay-timestamp"];
  const nonce = headers["wechatpay-nonce"];
  const signature = headers["wechatpay-signature"] || "";
  if (!timestamp || !nonce) {
    throw new Error("Missing WeChat Pay notify headers");
  }

  const signPayload = `${timestamp}\n${nonce}\n${rawBody}\n`;
  const platformPublicKey =
    env.WECHAT_PAY_MODE === "mock"
      ? getMockKeys().wechatPlatformPublic
      : fs.readFileSync(env.WECHAT_PAY_PLATFORM_PUBLIC_KEY_PATH!, "utf8");

  if (!rsaVerify(signPayload, signature, platformPublicKey)) {
    throw new Error("WeChat Pay notify signature verification failed");
  }

  const resource = JSON.parse(rawBody).resource;
  if (!resource) throw new Error("Missing resource in notify body");

  const apiV3Key =
    env.WECHAT_PAY_MODE === "mock"
      ? Buffer.from(getMockKeys().wechatApiV3Key, "hex")
      : Buffer.from(env.WECHAT_PAY_API_V3_KEY!, "utf8");

  const decrypted = aesGcmDecrypt(
    resource.ciphertext,
    resource.associated_data,
    resource.nonce,
    apiV3Key
  );
  const data = JSON.parse(decrypted.toString("utf8"));

  return {
    outTradeNo: data.out_trade_no,
    transactionId: data.transaction_id,
    tradeState: data.trade_state,
    amount: { total: data.amount?.total ?? 0 },
  };
}

/**
 * Queries the order from WeChat Pay as a fallback when the async notification
 * never arrives. Returns null in mock mode (nothing to ask).
 */
export async function wechatQueryNativeOrder(
  outTradeNo: string
): Promise<{ tradeState: string; transactionId?: string; total?: number } | null> {
  const env = getEnv();
  if (env.WECHAT_PAY_MODE === "mock") return null;

  const apiPath =
    `/v3/pay/transactions/out-trade-no/${encodeURIComponent(outTradeNo)}` +
    `?mchid=${encodeURIComponent(env.WECHAT_PAY_MCH_ID!)}`;
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = randomBytes(16).toString("hex");
  const signPayload = `GET\n${apiPath}\n${timestamp}\n${nonce}\n\n`;
  const privateKey = fs.readFileSync(env.WECHAT_PAY_PRIVATE_KEY_PATH!, "utf8");
  const signature = rsaSign(signPayload, privateKey);
  const authorization =
    `WECHATPAY2-SHA256-RSA2048 ` +
    `mchid="${env.WECHAT_PAY_MCH_ID}",nonce_str="${nonce}",timestamp="${timestamp}",` +
    `serial_no="${env.WECHAT_PAY_CERT_SERIAL_NO}",signature="${signature}"`;

  const res = await fetch(`https://api.mch.weixin.qq.com${apiPath}`, {
    headers: { Authorization: authorization, Accept: "application/json" },
  });
  const rawBody = await res.text();

  // Verify WeChat's signature on the response before trusting it.
  const respTimestamp = res.headers.get("wechatpay-timestamp");
  const respNonce = res.headers.get("wechatpay-nonce");
  const respSignature = res.headers.get("wechatpay-signature") || "";
  if (respTimestamp && respNonce) {
    const platformPublicKey = fs.readFileSync(
      env.WECHAT_PAY_PLATFORM_PUBLIC_KEY_PATH!,
      "utf8"
    );
    if (
      !rsaVerify(
        `${respTimestamp}\n${respNonce}\n${rawBody}\n`,
        respSignature,
        platformPublicKey
      )
    ) {
      throw new Error("WeChat Pay query response signature verification failed");
    }
  }

  if (!res.ok) {
    // 404 means WeChat has no such order yet, which is not an error for us.
    if (res.status === 404) return null;
    log("error", "WeChat Pay order query failed", { status: res.status });
    return null;
  }

  const data = JSON.parse(rawBody);
  return {
    tradeState: data.trade_state,
    transactionId: data.transaction_id,
    total: data.amount?.total,
  };
}

/**
 * Builds a genuinely signed + AES-GCM encrypted notification for the
 * mock-mode "Simulate payment success" button, so the real verification
 * path (signature check + decryption + amount check) actually runs.
 */
export function buildMockWeChatNotify(
  outTradeNo: string,
  amount: number
): { body: string; headers: Record<string, string> } {
  const keys = getMockKeys();
  const apiV3Key = Buffer.from(keys.wechatApiV3Key, "hex");
  const nonce = randomBytes(12);
  const plaintext = JSON.stringify({
    out_trade_no: outTradeNo,
    transaction_id: `mock_txn_${Date.now()}`,
    trade_state: "SUCCESS",
    amount: { total: amount, currency: "CNY" },
    mchid: "mock_mch",
    appid: "mock_app",
  });
  const associatedData = "transaction";
  const ciphertext = aesGcmEncrypt(plaintext, associatedData, nonce, apiV3Key);
  const resource = {
    original_type: "transaction",
    algorithm: "AEAD_AES_256_GCM",
    ciphertext,
    associated_data: associatedData,
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
  const nonceStr = randomBytes(16).toString("hex");
  const signPayload = `${ts}\n${nonceStr}\n${body}\n`;
  return {
    body,
    headers: {
      "wechatpay-timestamp": ts,
      "wechatpay-nonce": nonceStr,
      "wechatpay-signature": rsaSign(signPayload, keys.wechatMerchantPrivate),
      "wechatpay-serial": "mock_serial",
      "content-type": "application/json",
    },
  };
}
