-- CreateEnum
CREATE TYPE "EscrowStatus" AS ENUM ('PENDING', 'FUNDED');

-- AlterTable
ALTER TABLE "Issue" ADD COLUMN     "escrowAddress" TEXT,
ADD COLUMN     "escrowSignature" TEXT,
ADD COLUMN     "escrowStatus" "EscrowStatus" NOT NULL DEFAULT 'PENDING';

-- CreateIndex
CREATE UNIQUE INDEX "Issue_escrowAddress_key" ON "Issue"("escrowAddress");

-- CreateIndex
CREATE UNIQUE INDEX "Issue_escrowSignature_key" ON "Issue"("escrowSignature");

