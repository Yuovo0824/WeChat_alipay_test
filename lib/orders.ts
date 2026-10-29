import "server-only";
import { prisma } from "@/lib/db";
import { log } from "@/lib/logger";
import { wechatQueryNativeOrder } from "@/lib/wechat";
import { alipayQueryTrade } from "@/lib/alipay";

export type OrderStatus = "pending" | "paid" | "failed" | "closed";

export interface CreateOrderInput {
  userId: string;
  amount: number; // in cents
  provider: "wechat" | "alipay";
}

const ORDER_EXPIRY_MS = 15 * 60 * 1000; // 15 minutes

export async function createOrder(input: CreateOrderInput) {
  const expiresAt = new Date(Date.now() + ORDER_EXPIRY_MS);
  return prisma.order.create({
    data: {
      userId: input.userId,
      amount: input.amount,
      currency: "CNY",
      provider: input.provider,
      status: "pending",
      expiresAt,
    },
  });
}

export async function getOrderById(id: string) {
  return prisma.order.findUnique({ where: { id } });
}

export async function getOrdersByUser(userId: string) {
  return prisma.order.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
}

export async function updateOrderStatus(
  orderId: string,
  status: OrderStatus,
  expectedCurrentStatus: OrderStatus,
  providerOrderId?: string
) {
  // Idempotency: only update if status matches expected
  const updated = await prisma.order.updateMany({
    where: {
      id: orderId,
      status: expectedCurrentStatus,
    },
    data: {
      status,
      ...(providerOrderId ? { providerOrderId } : {}),
    },
  });
  return updated.count > 0;
}

export async function closeExpiredOrders() {
  const now = new Date();
  return prisma.order.updateMany({
    where: {
      status: "pending",
      expiresAt: { lte: now },
    },
    data: { status: "closed" as const },
  });
}

/**
 * Fallback used when the async notification never arrives: ask the provider
 * directly. Runs only for still-pending orders, and still enforces expiry and
 * amount checks, so a provider response can never mark an order paid for the
 * wrong amount.
 */
export async function queryAndSyncOrderStatus(
  orderId: string
): Promise<{ status: OrderStatus; synced: boolean }> {
  const order = await getOrderById(orderId);
  if (!order) throw new Error("Order not found");
  if (order.status !== "pending") {
    return { status: order.status as OrderStatus, synced: false };
  }

  // 1. Expiry wins over any provider response.
  if (order.expiresAt && new Date() > order.expiresAt) {
    await updateOrderStatus(orderId, "closed", "pending");
    return { status: "closed", synced: true };
  }

  // 2. Ask the provider.
  try {
    if (order.provider === "wechat") {
      const remote = await wechatQueryNativeOrder(order.id);
      if (!remote) return { status: "pending", synced: false };

      if (remote.total !== undefined && remote.total !== order.amount) {
        log("error", "WeChat Pay query amount mismatch", {
          orderId: order.id,
          expected: order.amount,
          received: remote.total,
        });
        return { status: "pending", synced: false };
      }
      return settleFromRemote(orderId, remote.tradeState, remote.transactionId, {
        paid: ["SUCCESS"],
        closed: ["CLOSED", "REVOKED"],
        failed: ["PAYERROR"],
      });
    }

    const remote = await alipayQueryTrade(order.id);
    if (!remote) return { status: "pending", synced: false };

    if (remote.totalAmount !== undefined) {
      const receivedCents = Math.round(Number(remote.totalAmount) * 100);
      if (receivedCents !== order.amount) {
        log("error", "Alipay query amount mismatch", {
          orderId: order.id,
          expected: order.amount,
          received: remote.totalAmount,
        });
        return { status: "pending", synced: false };
      }
    }
    return settleFromRemote(orderId, remote.tradeStatus, remote.tradeNo, {
      paid: ["TRADE_SUCCESS", "TRADE_FINISHED"],
      closed: ["TRADE_CLOSED"],
      failed: [],
    });
  } catch (e) {
    // A provider outage must not break the order page.
    log("warn", "Provider order query failed", {
      orderId,
      error: (e as Error).message,
    });
    return { status: "pending", synced: false };
  }
}

async function settleFromRemote(
  orderId: string,
  remoteState: string,
  providerTradeNo: string | undefined,
  states: { paid: string[]; closed: string[]; failed: string[] }
): Promise<{ status: OrderStatus; synced: boolean }> {
  if (states.paid.includes(remoteState)) {
    const updated = await updateOrderStatus(
      orderId,
      "paid",
      "pending",
      providerTradeNo
    );
    return { status: "paid", synced: updated };
  }
  if (states.closed.includes(remoteState)) {
    const updated = await updateOrderStatus(orderId, "closed", "pending");
    return { status: "closed", synced: updated };
  }
  if (states.failed.includes(remoteState)) {
    const updated = await updateOrderStatus(orderId, "failed", "pending");
    return { status: "failed", synced: updated };
  }
  return { status: "pending", synced: false };
}
