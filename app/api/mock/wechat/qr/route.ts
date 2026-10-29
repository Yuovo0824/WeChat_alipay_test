import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { log } from "@/lib/logger";

// Creates a pending "scan to login" ticket. The desktop polls this ticket
// while the phone confirms it, mirroring the real WeChat QR login flow.
export async function POST() {
  try {
    const env = getEnv();
    if (env.WECHAT_LOGIN_MODE !== "mock") {
      return NextResponse.json({ error: "Not available outside mock mode" }, { status: 403 });
    }
    const ticket = await prisma.mockLoginTicket.create({
      data: { provider: "wechat", code: "", status: "pending" },
    });
    return NextResponse.json({ ticketId: ticket.id });
  } catch (e) {
    log("error", "Create mock QR ticket failed", { error: (e as Error).message });
    return NextResponse.json({ error: "Failed to create ticket" }, { status: 500 });
  }
}
