import { NextRequest, NextResponse } from "next/server";
import { alipayVerifyNotify } from "@/lib/alipay";
import { updateOrderStatus, getOrderById } from "@/lib/orders";
import { log } from "@/lib/logger";

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const params = new URLSearchParams(rawBody);
    const paramObj: Record<string, string> = {};
    for (const [key, value] of params) {
      paramObj[key] = value;
    }

    const notifyData = alipayVerifyNotify(paramObj);

    const order = await getOrderById(notifyData.outTradeNo);
    if (!order) {
      log("warn", "Alipay notify: order not found", {
        outTradeNo: notifyData.outTradeNo,
      });
      return new NextResponse("fail", { status: 404 });
    }

    // Verify amount
    const expectedAmount = (order.amount / 100).toFixed(2);
    if (expectedAmount !== notifyData.totalAmount) {
      log("error", "Alipay notify: amount mismatch", {
        expected: expectedAmount,
        received: notifyData.totalAmount,
      });
      return new NextResponse("fail", { status: 400 });
    }

    if (notifyData.tradeStatus === "TRADE_SUCCESS") {
      const updated = await updateOrderStatus(
        order.id,
        "paid",
        "pending",
        notifyData.tradeNo
      );
      if (!updated) {
        log("info", "Alipay notify: idempotent, already handled", {
          orderId: order.id,
        });
      }
    }

    return new NextResponse("success");
  } catch (e) {
    log("error", "Alipay notify handler error", {
      error: (e as Error).message,
    });
    return new NextResponse("fail", { status: 500 });
  }
}
