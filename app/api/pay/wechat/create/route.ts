import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { createOrder } from "@/lib/orders";
import { wechatCreateNativePay } from "@/lib/wechat";
import { log } from "@/lib/logger";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const amount = Number(body.amount);
    if (!amount || amount <= 0 || !Number.isInteger(amount)) {
      return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
    }

    // 1. Create order server-side
    const order = await createOrder({
      userId: session.userId,
      amount,
      provider: "wechat",
    });

    // 2. Call provider
    const { codeUrl } = await wechatCreateNativePay(
      order.id,
      amount,
      "Test Item"
    );

    return NextResponse.json({ orderId: order.id, codeUrl });
  } catch (e) {
    log("error", "WeChat pay create failed", { error: (e as Error).message });
    return NextResponse.json(
      { error: "Payment creation failed" },
      { status: 500 }
    );
  }
}
