-- AlterTable
ALTER TABLE "Challenge" ADD COLUMN "inviteCode" TEXT;
ALTER TABLE "Challenge" ADD COLUMN "inviteCodeExpiresAt" DATETIME;

-- CreateIndex
CREATE UNIQUE INDEX "Challenge_inviteCode_key" ON "Challenge"("inviteCode");
