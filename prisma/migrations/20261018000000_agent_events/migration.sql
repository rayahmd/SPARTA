-- CreateTable
CREATE TABLE "agent_events" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "seq" INTEGER NOT NULL,
    "runId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "agentName" TEXT NOT NULL,
    "messageId" TEXT,
    "simTimeSec" REAL NOT NULL,
    "summary" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "agent_events_createdAt_idx" ON "agent_events"("createdAt");
