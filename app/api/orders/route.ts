import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getOrdersByUser } from "@/lib/orders";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const orders = await getOrdersByUser(session.userId);
  return NextResponse.json(orders);
}
