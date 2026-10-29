import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getOrderById, queryAndSyncOrderStatus } from "@/lib/orders";
import { log } from "@/lib/logger";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const order = await getOrderById(id);
    if (!order) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (order.userId !== session.userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Fallback for missed notifications, plus expiry enforcement.
    const { status, synced } = await queryAndSyncOrderStatus(id);

    return NextResponse.json({
      ...order,
      status: synced ? status : order.status,
      updatedAt: synced ? new Date() : order.updatedAt,
    });
  } catch (e) {
    log("error", "Order detail failed", { error: (e as Error).message });
    return NextResponse.json(
      { error: "Failed to load order", detail: (e as Error).message },
      { status: 500 }
    );
  }
}
