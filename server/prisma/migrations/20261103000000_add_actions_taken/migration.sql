-- AlterTable Ticket: add updatedAt and resolvedAt
ALTER TABLE "Ticket" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN "resolvedAt" TIMESTAMP(3);

-- Backfill Ticket updatedAt with createdAt
UPDATE "Ticket" SET "updatedAt" = "createdAt";

-- CreateTable ActionTaken
CREATE TABLE "ActionTaken" (
    "id" SERIAL NOT NULL,
    "ticketId" INTEGER NOT NULL,
    "actionDateTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actionDescription" TEXT NOT NULL,
    "result" TEXT NOT NULL,
    "performedById" INTEGER NOT NULL,
    "followUpRequired" BOOLEAN NOT NULL DEFAULT false,
    "followUpNote" TEXT,
    "attachmentNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActionTaken_pkey" PRIMARY KEY ("id")
);

-- CreateTable ActionTakenRevision
CREATE TABLE "ActionTakenRevision" (
    "id" TEXT NOT NULL,
    "actionTakenId" INTEGER NOT NULL,
    "editedById" INTEGER NOT NULL,
    "editedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "beforeSnapshot" JSONB NOT NULL,
    "afterSnapshot" JSONB NOT NULL,

    CONSTRAINT "ActionTakenRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable IdempotencyKey
CREATE TABLE "IdempotencyKey" (
    "id" SERIAL NOT NULL,
    "key" TEXT NOT NULL,
    "route" TEXT NOT NULL,
    "ticketId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "requestHash" TEXT NOT NULL,
    "statusCode" INTEGER,
    "responseBody" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IdempotencyKey_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ActionTaken_ticketId_idx" ON "ActionTaken"("ticketId");

-- CreateIndex
CREATE INDEX "ActionTaken_performedById_idx" ON "ActionTaken"("performedById");

-- CreateIndex
CREATE INDEX "ActionTakenRevision_actionTakenId_editedAt_idx" ON "ActionTakenRevision"("actionTakenId", "editedAt");

-- CreateIndex
CREATE INDEX "ActionTakenRevision_editedById_idx" ON "ActionTakenRevision"("editedById");

-- CreateIndex
CREATE UNIQUE INDEX "IdempotencyKey_route_ticketId_userId_key_key" ON "IdempotencyKey"("route", "ticketId", "userId", "key");

-- CreateIndex
CREATE INDEX "IdempotencyKey_expiresAt_idx" ON "IdempotencyKey"("expiresAt");

-- AddForeignKey
ALTER TABLE "ActionTaken" ADD CONSTRAINT "ActionTaken_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActionTaken" ADD CONSTRAINT "ActionTaken_performedById_fkey" FOREIGN KEY ("performedById") REFERENCES "RequesterUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActionTakenRevision" ADD CONSTRAINT "ActionTakenRevision_actionTakenId_fkey" FOREIGN KEY ("actionTakenId") REFERENCES "ActionTaken"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActionTakenRevision" ADD CONSTRAINT "ActionTakenRevision_editedById_fkey" FOREIGN KEY ("editedById") REFERENCES "RequesterUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Append-Only Trigger Function and Triggers for ActionTakenRevision
CREATE OR REPLACE FUNCTION prevent_action_taken_revision_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'ActionTakenRevision records are append-only and cannot be updated, deleted, or truncated.';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_prevent_action_taken_revision_mutation
BEFORE UPDATE OR DELETE ON "ActionTakenRevision"
FOR EACH ROW
EXECUTE FUNCTION prevent_action_taken_revision_mutation();

CREATE TRIGGER trg_prevent_action_taken_revision_truncate
BEFORE TRUNCATE ON "ActionTakenRevision"
FOR EACH STATEMENT
EXECUTE FUNCTION prevent_action_taken_revision_mutation();

-- Revoke TRUNCATE privilege on ActionTakenRevision from the application database role
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'toktickit') THEN
    REVOKE TRUNCATE ON TABLE "ActionTakenRevision" FROM toktickit;
  END IF;
END $$;
