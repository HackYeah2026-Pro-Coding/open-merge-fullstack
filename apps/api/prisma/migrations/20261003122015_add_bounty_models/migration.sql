/*
  Warnings:

  - You are about to drop the `User` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropTable
DROP TABLE "User";

-- CreateTable
CREATE TABLE "GithubAccount" (
    "id" TEXT NOT NULL,
    "githubId" INTEGER NOT NULL,
    "githubLogin" TEXT NOT NULL,
    "name" TEXT,
    "avatarUrl" TEXT,
    "walletId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "GithubAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Wallet" (
    "id" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "linkedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Wallet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GithubRepo" (
    "id" TEXT NOT NULL,
    "githubRepoName" TEXT NOT NULL,
    "githubRepoUrl" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "GithubRepo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Issue" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "labels" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "rewardAmount" BIGINT NOT NULL,
    "rewardSymbol" TEXT NOT NULL,
    "githubRepoId" TEXT NOT NULL,
    "paidOutToId" TEXT,
    "paidOutAt" TIMESTAMPTZ(3),
    "closedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Issue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payout" (
    "id" TEXT NOT NULL,
    "issueId" TEXT NOT NULL,
    "recipientGithubId" INTEGER NOT NULL,
    "walletAddress" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "releasedAt" TIMESTAMPTZ(3),

    CONSTRAINT "Payout_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GithubAccount_githubId_key" ON "GithubAccount"("githubId");

-- CreateIndex
CREATE UNIQUE INDEX "GithubAccount_githubLogin_key" ON "GithubAccount"("githubLogin");

-- CreateIndex
CREATE UNIQUE INDEX "GithubAccount_walletId_key" ON "GithubAccount"("walletId");

-- CreateIndex
CREATE UNIQUE INDEX "Wallet_address_key" ON "Wallet"("address");

-- CreateIndex
CREATE UNIQUE INDEX "GithubRepo_githubRepoName_key" ON "GithubRepo"("githubRepoName");

-- CreateIndex
CREATE INDEX "Issue_githubRepoId_idx" ON "Issue"("githubRepoId");

-- CreateIndex
CREATE INDEX "Issue_paidOutToId_idx" ON "Issue"("paidOutToId");

-- CreateIndex
CREATE UNIQUE INDEX "Payout_issueId_key" ON "Payout"("issueId");

-- CreateIndex
CREATE INDEX "Payout_recipientGithubId_idx" ON "Payout"("recipientGithubId");

-- AddForeignKey
ALTER TABLE "GithubAccount" ADD CONSTRAINT "GithubAccount_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "Wallet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Issue" ADD CONSTRAINT "Issue_githubRepoId_fkey" FOREIGN KEY ("githubRepoId") REFERENCES "GithubRepo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Issue" ADD CONSTRAINT "Issue_paidOutToId_fkey" FOREIGN KEY ("paidOutToId") REFERENCES "GithubAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payout" ADD CONSTRAINT "Payout_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "Issue"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payout" ADD CONSTRAINT "Payout_recipientGithubId_fkey" FOREIGN KEY ("recipientGithubId") REFERENCES "GithubAccount"("githubId") ON DELETE RESTRICT ON UPDATE CASCADE;
