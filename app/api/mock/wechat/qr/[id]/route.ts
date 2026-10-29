import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { log } from "@/lib/logger";

// Desktop polls this endpoint. When the phone has confirmed, we hand back the
// chosen mock user so the desktop can finish login via the real callback route.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ticket = await prisma.mockLoginTicket.findUnique({ where: { id } });
    if (!ticket) {
      return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
    }
    return NextResponse.json({
      status: ticket.status,
      code: ticket.status === "confirmed" ? ticket.code : null,
    });
  } catch (e) {
    log("error", "Poll mock QR ticket failed", {
      error: (e as Error).message,
    });
    return NextResponse.json(
      { error: "Failed to read ticket", detail: (e as Error).message },
      { status: 500 }
    );
  }
}
