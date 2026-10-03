-- AlterTable
ALTER TABLE "GithubRepo" ADD COLUMN     "description" TEXT,
ADD COLUMN     "isPrivate" BOOLEAN NOT NULL DEFAULT false;

