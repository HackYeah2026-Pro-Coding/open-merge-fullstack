-- AlterTable
ALTER TABLE "Issue" ADD COLUMN     "githubIssueNumber" INTEGER,
ADD COLUMN     "githubIssueUrl" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Issue_githubRepoId_githubIssueNumber_key" ON "Issue"("githubRepoId", "githubIssueNumber");
