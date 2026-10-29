import { NextRequest, NextResponse } from "next/server";
import { buildMockWeChatNotify, wechatVerifyNotify } from "@/lib/wechat";
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
    const notify = buildMockWeChatNotify(orderId, amount);
    const data = await wechatVerifyNotify(notify.headers, notify.body);
    if (data.amount.total !== order.amount) {
      return NextResponse.json({ error: "Amount mismatch" }, { status: 400 });
    }
    const updated = await updateOrderStatus(orderId, "paid", "pending", data.transactionId);
    log("info", "Mock WeChat simulate", { orderId, updated });
    return NextResponse.json({ success: true, updated });
  } catch (e) {
    log("error", "Mock WeChat simulate failed", { error: (e as Error).message });
    return NextResponse.json(
      { error: "Simulation failed", detail: (e as Error).message },
      { status: 500 }
    );
  }
}
