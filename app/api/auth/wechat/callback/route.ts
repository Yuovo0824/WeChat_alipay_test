import { NextRequest, NextResponse } from "next/server";
import { validateOAuthState, createSession } from "@/lib/session";
import {
  exchangeWeChatCode,
  fetchWeChatUserInfo,
  loginOrCreateWeChatUser,
  mockWeChatUser,
} from "@/lib/wechat";
import { getEnv } from "@/lib/env";
import { log } from "@/lib/logger";

export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  // 1. Validate CSRF state
  if (!(await validateOAuthState(state))) {
    log("warn", "WeChat callback: invalid state", { state });
    return NextResponse.redirect(new URL("/?error=csrf", req.url));
  }

  const env = getEnv();

  try {
    let userInfo;

    if (env.WECHAT_LOGIN_MODE === "mock") {
      // Mock: code is the user id to simulate
      if (!code) {
        return NextResponse.redirect(new URL("/?error=no_code", req.url));
      }
      userInfo = mockWeChatUser(code);
    } else {
      if (!code) {
        return NextResponse.redirect(new URL("/?error=no_code", req.url));
      }
      const token = await exchangeWeChatCode(code);
      userInfo = await fetchWeChatUserInfo(token.access_token, token.openid);
    }

    const userId = await loginOrCreateWeChatUser(userInfo);
    await createSession(userId);

    log("info", "WeChat login success", { userId });
    return NextResponse.redirect(new URL("/dashboard", req.url));
  } catch (e) {
    log("error", "WeChat callback failed", {
      error: (e as Error).message,
    });
    return NextResponse.redirect(new URL("/?error=wechat_callback_failed", req.url));
  }
}
