import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { createOrder } from "@/lib/orders";
import { alipayCreatePcPay } from "@/lib/alipay";
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

    const order = await createOrder({
      userId: session.userId,
      amount,
      provider: "alipay",
    });

    const redirectUrl = alipayCreatePcPay(order.id, amount, "Test Item");

    return NextResponse.json({ orderId: order.id, redirectUrl });
  } catch (e) {
    log("error", "Alipay pay create failed", { error: (e as Error).message });
    return NextResponse.json(
      { error: "Payment creation failed" },
      { status: 500 }
    );
  }
}
