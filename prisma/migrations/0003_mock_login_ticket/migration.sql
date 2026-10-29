-- CreateTable
CREATE TABLE "MockLoginTicket" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "provider" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedAt" DATETIME
);

-- CreateIndex
CREATE INDEX "MockLoginTicket_status_idx" ON "MockLoginTicket"("status");
