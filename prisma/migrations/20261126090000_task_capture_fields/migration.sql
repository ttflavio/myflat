-- AlterTable
ALTER TABLE "tasks" ADD COLUMN     "completed_at" TIMESTAMP(3),
ADD COLUMN     "created_by_id" UUID,
ADD COLUMN     "due_reason" TEXT,
ADD COLUMN     "review_reason" TEXT,
ADD COLUMN     "source_text" TEXT;
