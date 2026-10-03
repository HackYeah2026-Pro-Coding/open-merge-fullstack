-- AlterEnum
ALTER TYPE "EscrowStatus" ADD VALUE 'RELEASED';

-- AlterTable
ALTER TABLE "Payout" ADD COLUMN     "releaseSignature" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Payout_releaseSignature_key" ON "Payout"("releaseSignature");

