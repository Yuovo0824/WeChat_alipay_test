import { NextRequest, NextResponse } from "next/server";
import { buildMockAlipayNotify, alipayVerifyNotify } from "@/lib/alipay";
import { updateOrderStatus, getOrderById } from "@/lib/orders";
import { log } from "@/lib/logger";

export async function POST(req: NextRequest) {
  try {
    const { orderId, amount } = await req.json();
    if (!orderId || !amount) {
      return NextResponse.json({ error: "orderId, amount required" }, { status: 400 });
    }

    const order = await getOrderById(orderId);
    if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });

    const notify = buildMockAlipayNotify(orderId, amount);
    const params = Object.fromEntries(new URLSearchParams(notify.body));
    const data = alipayVerifyNotify(params);

    const expectedAmount = (order.amount / 100).toFixed(2);
    if (data.totalAmount !== expectedAmount) {
      return NextResponse.json({ error: "Amount mismatch" }, { status: 400 });
    }

    const updated = await updateOrderStatus(orderId, "paid", "pending", data.tradeNo);
    log("info", "Mock Alipay simulate", { orderId, updated });

    return NextResponse.json({ success: true, updated });
  } catch (e) {
    log("error", "Mock Alipay simulate failed", { error: (e as Error).message });
    return NextResponse.json({ error: "Simulation failed" }, { status: 500 });
  }
}
