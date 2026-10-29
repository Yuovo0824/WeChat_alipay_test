import { NextRequest, NextResponse } from "next/server";
import { setOAuthState } from "@/lib/session";
import { alipayAuthUrl } from "@/lib/alipay";
import { log } from "@/lib/logger";

export async function GET(req: NextRequest) {
  try {
    const state = await setOAuthState("alipay");
    return NextResponse.redirect(new URL(alipayAuthUrl(state), req.url));
  } catch (e) {
    log("error", "Alipay auth start failed", {
      error: (e as Error).message,
    });
    return NextResponse.redirect(
      new URL("/?error=alipay_start_failed", req.url)
    );
  }
}
