import { NextRequest, NextResponse } from "next/server";
import { wechatVerifyNotify } from "@/lib/wechat";
import { updateOrderStatus, getOrderById } from "@/lib/orders";
import { log } from "@/lib/logger";

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const headers: Record<string, string | null> = {};
    req.headers.forEach((value, key) => {
      headers[key.toLowerCase()] = value;
    });

    const notifyData = await wechatVerifyNotify(headers, rawBody);

    const order = await getOrderById(notifyData.outTradeNo);
    if (!order) {
      log("warn", "WeChat notify: order not found", {
        outTradeNo: notifyData.outTradeNo,
      });
      return new NextResponse(
        JSON.stringify({ code: "FAIL", message: "Order not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    // Verify amount matches
    if (order.amount !== notifyData.amount.total) {
      log("error", "WeChat notify: amount mismatch", {
        expected: order.amount,
        received: notifyData.amount.total,
      });
      return new NextResponse(
        JSON.stringify({ code: "FAIL", message: "Amount mismatch" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    if (notifyData.tradeState === "SUCCESS") {
      const updated = await updateOrderStatus(
        order.id,
        "paid",
        "pending",
        notifyData.transactionId
      );
      if (!updated) {
        log("info", "WeChat notify: idempotent, already handled", {
          orderId: order.id,
        });
      }
    }

    // WeChat Pay expects 200 with specific body
    return new NextResponse(
      JSON.stringify({ code: "SUCCESS", message: "OK" }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (e) {
    log("error", "WeChat notify handler error", {
      error: (e as Error).message,
    });
    return new NextResponse(
      JSON.stringify({ code: "FAIL", message: (e as Error).message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
