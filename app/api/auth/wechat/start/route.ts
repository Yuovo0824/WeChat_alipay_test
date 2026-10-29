import { NextRequest, NextResponse } from "next/server";
import { setOAuthState } from "@/lib/session";
import { wechatAuthUrl } from "@/lib/wechat";
import { log } from "@/lib/logger";

export async function GET(req: NextRequest) {
  try {
    const state = await setOAuthState();
    return NextResponse.redirect(wechatAuthUrl(state));
  } catch (e) {
    // Misconfiguration is the most likely cause here; log the real reason so
    // the operator can fix it instead of guessing from a bare 500.
    log("error", "WeChat auth start failed", {
      error: (e as Error).message,
    });
    return NextResponse.redirect(
      new URL("/?error=wechat_start_failed", req.url)
    );
  }
}
