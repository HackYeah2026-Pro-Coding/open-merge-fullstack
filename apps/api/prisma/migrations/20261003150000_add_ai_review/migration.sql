-- CreateEnum
CREATE TYPE "PullRequestState" AS ENUM ('open', 'merged', 'closed');

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('pending', 'completed', 'failed');

-- CreateEnum
CREATE TYPE "CiState" AS ENUM ('passed', 'failed', 'none', 'timeout');

-- CreateEnum
CREATE TYPE "ReviewVerdict" AS ENUM ('approve', 'changes');

-- CreateTable
CREATE TABLE "PullRequest" (
    "id" TEXT NOT NULL,
    "githubRepoId" TEXT NOT NULL,
    "issueId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "authorLogin" TEXT NOT NULL,
    "authorAvatarUrl" TEXT,
    "state" "PullRequestState" NOT NULL DEFAULT 'open',
    "headSha" TEXT NOT NULL,
    "openedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "PullRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Review" (
    "id" TEXT NOT NULL,
    "pullRequestId" TEXT NOT NULL,
    "headSha" TEXT NOT NULL,
    "status" "ReviewStatus" NOT NULL DEFAULT 'pending',
    "ciState" "CiState",
    "failedJobs" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "contextNotes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "error" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMPTZ(3),

    CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewerResult" (
    "id" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "reviewer" TEXT NOT NULL,
    "model" TEXT,
    "verdict" "ReviewVerdict",
    "output" JSONB,
    "error" TEXT,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReviewerResult_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PullRequest_issueId_idx" ON "PullRequest"("issueId");

-- CreateIndex
CREATE UNIQUE INDEX "PullRequest_githubRepoId_number_key" ON "PullRequest"("githubRepoId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "Review_pullRequestId_headSha_key" ON "Review"("pullRequestId", "headSha");

-- CreateIndex
CREATE UNIQUE INDEX "ReviewerResult_reviewId_reviewer_key" ON "ReviewerResult"("reviewId", "reviewer");

-- AddForeignKey
ALTER TABLE "PullRequest" ADD CONSTRAINT "PullRequest_githubRepoId_fkey" FOREIGN KEY ("githubRepoId") REFERENCES "GithubRepo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PullRequest" ADD CONSTRAINT "PullRequest_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "Issue"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_pullRequestId_fkey" FOREIGN KEY ("pullRequestId") REFERENCES "PullRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewerResult" ADD CONSTRAINT "ReviewerResult_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "Review"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

