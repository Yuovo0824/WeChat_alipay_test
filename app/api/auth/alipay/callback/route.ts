import { NextRequest, NextResponse } from "next/server";
import { validateOAuthState, createSession } from "@/lib/session";
import {
  exchangeAlipayCode,
  fetchAlipayUserInfo,
  loginOrCreateAlipayUser,
  mockAlipayUser,
} from "@/lib/alipay";
import { getEnv } from "@/lib/env";
import { log } from "@/lib/logger";

export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const authCode = url.searchParams.get("auth_code");
  const state = url.searchParams.get("state");

  // 1. Validate CSRF state
  if (!(await validateOAuthState(state))) {
    log("warn", "Alipay callback: invalid state", { state });
    return NextResponse.redirect(new URL("/?error=csrf", req.url));
  }

  const env = getEnv();

  try {
    let userInfo;

    if (env.ALIPAY_LOGIN_MODE === "mock") {
      // Mock: auth_code is the user id to simulate
      if (!authCode) {
        return NextResponse.redirect(new URL("/?error=no_code", req.url));
      }
      userInfo = mockAlipayUser(authCode);
    } else {
      if (!authCode) {
        return NextResponse.redirect(new URL("/?error=no_code", req.url));
      }
      const token = await exchangeAlipayCode(authCode);
      userInfo = await fetchAlipayUserInfo(
        token.alipay_system_oauth_token_response.access_token
      );
    }

    const userId = await loginOrCreateAlipayUser(userInfo);
    await createSession(userId);

    log("info", "Alipay login success", { userId });
    return NextResponse.redirect(new URL("/dashboard", req.url));
  } catch (e) {
    log("error", "Alipay callback failed", {
      error: (e as Error).message,
    });
    return NextResponse.redirect(new URL("/?error=alipay_callback_failed", req.url));
  }
}
