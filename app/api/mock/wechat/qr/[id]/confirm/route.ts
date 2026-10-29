import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { log } from "@/lib/logger";

// Called by the phone after "scanning". Confirms the ticket with a chosen user.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { code } = await req.json();
    if (!code) {
      return NextResponse.json({ error: "code required" }, { status: 400 });
    }
    const ticket = await prisma.mockLoginTicket.findUnique({ where: { id } });
    if (!ticket) {
      return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
    }
    if (ticket.status === "confirmed") {
      // Idempotent: scanning twice must not create two logins
      return NextResponse.json({ ok: true, alreadyConfirmed: true });
    }
    await prisma.mockLoginTicket.update({
      where: { id },
      data: { code, status: "confirmed", confirmedAt: new Date() },
    });
    log("info", "Mock QR ticket confirmed", { ticketId: id });
    return NextResponse.json({ ok: true });
  } catch (e) {
    log("error", "Confirm mock QR ticket failed", { error: (e as Error).message });
    return NextResponse.json({ error: "Failed to confirm" }, { status: 500 });
  }
}
