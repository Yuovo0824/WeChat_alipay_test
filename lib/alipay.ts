import "server-only";
import { getEnv } from "./env";
import { prisma } from "./db";
import { log } from "./logger";
import { getMockKeys, rsaSign, rsaVerify } from "./crypto";

// ---------------------------------------------------------------------------
// Signing helpers
//
// Alipay signs with RSA2 (SHA256withRSA) over a canonical string built from the
// request parameters sorted by key, joined as `k=v&k=v` using RAW (unencoded)
// values.
//
// Per Alipay's docs / Java SDK the two directions differ slightly:
//   - signing an outgoing request : include everything except `sign`
//   - verifying an async notify    : include everything except `sign` and `sign_type`
// The mock path exercises both, so the round-trip is covered by tests.
// Confirm against the real sandbox once credentials are available.
// ---------------------------------------------------------------------------

function alipayTimestamp(): string {
  // Alipay expects "yyyy-MM-dd HH:mm:ss" in GMT+8
  const d = new Date(Date.now() + 8 * 60 * 60 * 1000);
  return d.toISOString().replace("T", " ").replace(/\.\d{3}Z$/, "");
}

function requestSignContent(params: Record<string, string>): string {
  return Object.keys(params)
    .filter((k) => k !== "sign" && params[k] !== undefined && params[k] !== "")
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join("&");
}

function notifySignContent(params: Record<string, string>): string {
  return Object.keys(params)
    .filter(
      (k) => k !== "sign" && k !== "sign_type" && params[k] !== undefined && params[k] !== ""
    )
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join("&");
}

/**
 * Builds a fully signed parameter set for an Alipay gateway call.
 * `extra` holds the method-specific public parameters.
 */
function buildSignedRequest(
  method: string,
  extra: Record<string, string>
): Record<string, string> {
  const env = getEnv();
  const params: Record<string, string> = {
    app_id: env.ALIPAY_APP_ID!,
    method,
    charset: "utf-8",
    sign_type: "RSA2",
    timestamp: alipayTimestamp(),
    version: "1.0",
    ...extra,
  };
  params.sign = rsaSign(requestSignContent(params), env.ALIPAY_PRIVATE_KEY!);
  return params;
}

/**
 * POSTs a signed request to the Alipay gateway and returns the parsed body.
 * Alipay replies with either `<method>_response` or `error_response`.
 */
async function alipayGatewayCall<T>(
  method: string,
  extra: Record<string, string>
): Promise<T> {
  const env = getEnv();
  const params = buildSignedRequest(method, extra);
  const res = await fetch(env.ALIPAY_GATEWAY!, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded;charset=utf-8" },
    body: new URLSearchParams(params).toString(),
  });
  const body = await res.json();

  if (body.error_response) {
    log("error", `Alipay ${method} failed`, {
      code: body.error_response.code,
      sub_code: body.error_response.sub_code,
      sub_msg: body.error_response.sub_msg,
    });
    throw new Error(
      `Alipay ${method} failed: ${body.error_response.sub_msg || body.error_response.msg}`
    );
  }
  return body as T;
}

// ---------------------------------------------------------------------------
// Login (Alipay Open Platform OAuth)
// ---------------------------------------------------------------------------

interface AlipayUserInfo {
  provider: "alipay";
  providerId: string;
  nickname?: string;
  avatar?: string;
}

interface AlipayTokenResponse {
  alipay_system_oauth_token_response: {
    access_token: string;
    user_id: string;
    expires_in: number;
    refresh_token?: string;
  };
  sign?: string;
}

interface AlipayUserInfoResponse {
  alipay_user_info_share_response: {
    user_id: string;
    nick_name?: string;
    avatar?: string;
  };
  sign?: string;
}

export function alipayAuthUrl(state: string): string {
  const env = getEnv();
  if (env.ALIPAY_LOGIN_MODE === "mock") {
    return `${env.APP_URL}/mock/alipay?state=${encodeURIComponent(state)}`;
  }
  const params = new URLSearchParams({
    app_id: env.ALIPAY_APP_ID!,
    redirect_uri: `${env.APP_URL}/api/auth/alipay/callback`,
    scope: "auth_user",
    state,
  });
  // Sandbox and production use different authorisation hosts. Using the
  // production host with a sandbox app id yields E004 PARAM_NOEXIST_APPID.
  const authHost =
    env.ALIPAY_LOGIN_MODE === "sandbox"
      ? "https://openauth.alipaydev.com"
      : "https://openauth.alipay.com";
  return `${authHost}/oauth2/publicAppAuthorize.htm?${params.toString()}`;
}

/**
 * Exchanges the OAuth `auth_code` for an access token.
 * `grant_type` and `code` are top-level public parameters, not biz_content.
 */
export async function exchangeAlipayCode(
  authCode: string
): Promise<AlipayTokenResponse> {
  const env = getEnv();
  if (env.ALIPAY_LOGIN_MODE === "mock") {
    throw new Error("exchangeAlipayCode() must not be called in mock mode");
  }
  return alipayGatewayCall<AlipayTokenResponse>("alipay.system.oauth.token", {
    grant_type: "authorization_code",
    code: authCode,
  });
}

/**
 * Fetches the user profile with the OAuth access token.
 * `auth_token` is a top-level public parameter, not biz_content.
 */
export async function fetchAlipayUserInfo(
  accessToken: string
): Promise<AlipayUserInfo> {
  const env = getEnv();
  if (env.ALIPAY_LOGIN_MODE === "mock") {
    throw new Error("fetchAlipayUserInfo() must not be called in mock mode");
  }
  const body = await alipayGatewayCall<AlipayUserInfoResponse>(
    "alipay.user.info.share",
    { auth_token: accessToken }
  );
  const resp = body.alipay_user_info_share_response;
  return {
    provider: "alipay",
    providerId: resp.user_id,
    nickname: resp.nick_name,
    avatar: resp.avatar,
  };
}

export async function loginOrCreateAlipayUser(
  userInfo: AlipayUserInfo
): Promise<string> {
  const user = await prisma.user.upsert({
    where: {
      provider_providerId: {
        provider: "alipay",
        providerId: userInfo.providerId,
      },
    },
    update: { nickname: userInfo.nickname, avatar: userInfo.avatar },
    create: {
      provider: "alipay",
      providerId: userInfo.providerId,
      nickname: userInfo.nickname,
      avatar: userInfo.avatar,
    },
  });
  return user.id;
}

export function mockAlipayUser(id: string): AlipayUserInfo {
  return {
    provider: "alipay",
    providerId: `mock_alipay_${id}`,
    nickname: `AlipayUser_${id}`,
    avatar: "",
  };
}

// ---------------------------------------------------------------------------
// Payment (Alipay PC website payment)
// ---------------------------------------------------------------------------

/**
 * Builds the Alipay PC website payment redirect URL.
 * In mock mode it points at a local mock checkout page.
 */
export function alipayCreatePcPay(
  outTradeNo: string,
  amount: number,
  subject: string
): string {
  const env = getEnv();
  const total = (amount / 100).toFixed(2);

  if (env.ALIPAY_PAY_MODE === "mock") {
    return (
      `${env.APP_URL}/mock/alipay/pay` +
      `?outTradeNo=${encodeURIComponent(outTradeNo)}` +
      `&amount=${total}&subject=${encodeURIComponent(subject)}`
    );
  }

  const params = buildSignedRequest("alipay.trade.page.pay", {
    biz_content: JSON.stringify({
      out_trade_no: outTradeNo,
      total_amount: total,
      subject,
      product_code: "FAST_INSTANT_TRADE_PAY",
    }),
    return_url: env.ALIPAY_RETURN_URL!,
    notify_url: env.ALIPAY_NOTIFY_URL!,
  });
  return `${env.ALIPAY_GATEWAY!}?${new URLSearchParams(params).toString()}`;
}

interface AlipayTradeQueryResponse {
  alipay_trade_query_response: {
    code: string;
    msg: string;
    trade_status?: string;
    trade_no?: string;
    total_amount?: string;
    out_trade_no?: string;
  };
  sign?: string;
}

/**
 * Queries the trade from Alipay as a fallback when the async notification
 * never arrives. Returns null in mock mode.
 */
export async function alipayQueryTrade(
  outTradeNo: string
): Promise<{
  tradeStatus: string;
  tradeNo?: string;
  totalAmount?: string;
} | null> {
  const env = getEnv();
  if (env.ALIPAY_PAY_MODE === "mock") return null;

  const body = await alipayGatewayCall<AlipayTradeQueryResponse>(
    "alipay.trade.query",
    { biz_content: JSON.stringify({ out_trade_no: outTradeNo }) }
  );
  const r = body.alipay_trade_query_response;

  // ACQ.TRADE_NOT_EXIST means the buyer has not reached the cashier yet.
  if (r.code !== "10000") {
    log("info", "Alipay trade query returned no trade", { code: r.code });
    return null;
  }
  return {
    tradeStatus: r.trade_status ?? "",
    tradeNo: r.trade_no,
    totalAmount: r.total_amount,
  };
}

/**
 * Verifies an Alipay async notification with the Alipay public key (RSA2).
 */
export function alipayVerifyNotify(params: Record<string, string>): {
  outTradeNo: string;
  tradeNo: string;
  totalAmount: string;
  tradeStatus: string;
} {
  const env = getEnv();
  const receivedSign = params.sign;
  if (!receivedSign) throw new Error("Missing sign in Alipay notify");

  const publicKey =
    env.ALIPAY_PAY_MODE === "mock"
      ? getMockKeys().alipayPublic
      : env.ALIPAY_PUBLIC_KEY!;

  if (!rsaVerify(notifySignContent(params), receivedSign, publicKey)) {
    throw new Error("Alipay notify signature verification failed");
  }

  return {
    outTradeNo: params.out_trade_no || "",
    tradeNo: params.trade_no || "",
    totalAmount: params.total_amount || "0",
    tradeStatus: params.trade_status || "",
  };
}

/**
 * Builds a correctly RSA2-signed mock notification for the
 * "Simulate payment success" button.
 */
export function buildMockAlipayNotify(
  outTradeNo: string,
  amount: number
): { body: string } {
  const keys = getMockKeys();
  const params: Record<string, string> = {
    notify_time: new Date().toISOString().replace("T", " ").replace(/\.\d{3}Z$/, ""),
    notify_type: "trade_status_sync",
    notify_id: `mock_notify_${Date.now()}`,
    app_id: "mock_app",
    charset: "utf-8",
    version: "1.0",
    sign_type: "RSA2",
    trade_no: `mock_trade_${Date.now()}`,
    out_trade_no: outTradeNo,
    trade_status: "TRADE_SUCCESS",
    total_amount: (amount / 100).toFixed(2),
    buyer_id: "mock_buyer",
  };
  params.sign = rsaSign(notifySignContent(params), keys.alipayPrivate);
  return { body: new URLSearchParams(params).toString() };
}
