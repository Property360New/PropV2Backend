/*
  Warnings:

  - You are about to drop the column `callStatus` on the `lead_queries` table. All the data in the column will be lost.
  - Added the required column `status` to the `lead_queries` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "lead_queries"
ADD COLUMN     "actualRevenue" DECIMAL(15,4),
ADD COLUMN     "bhk" TEXT,
ADD COLUMN     "closingAmount" DECIMAL(15,4),
ADD COLUMN     "discount" DECIMAL(5,2),
ADD COLUMN     "expVisitDate" TIMESTAMP(3),
ADD COLUMN     "floor" TEXT,
ADD COLUMN     "furnishingType" "FurnishingType",
ADD COLUMN     "incentiveSlab" DECIMAL(5,2),
ADD COLUMN     "leadActualSlab" DECIMAL(15,4),
ADD COLUMN     "leadType" "LeadType",
ADD COLUMN     "location" TEXT,
ADD COLUMN     "meetingDoneById" TEXT,
ADD COLUMN     "purpose" TEXT,
ADD COLUMN     "reason" TEXT,
ADD COLUMN     "sellRevenue" DECIMAL(15,4),
ADD COLUMN     "shiftingDate" TIMESTAMP(3),
ADD COLUMN     "size" DECIMAL(10,2),
ADD COLUMN     "status" "LeadStatus",
ADD COLUMN     "unitNo" TEXT,
ADD COLUMN     "visitDoneById" TEXT;

-- Step 2: Copy existing callStatus data into status before dropping callStatus
UPDATE "lead_queries" SET "status" = "callStatus";

-- Step 3: Enforce NOT NULL now that every row has a value, then drop old column
ALTER TABLE "lead_queries"
ALTER COLUMN "status" SET NOT NULL,
DROP COLUMN "callStatus";

-- CreateTable
CREATE TABLE "query_remarks" (
    "id" TEXT NOT NULL,
    "queryId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "query_remarks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "query_remarks_queryId_idx" ON "query_remarks"("queryId");

-- CreateIndex
CREATE INDEX "query_remarks_createdById_idx" ON "query_remarks"("createdById");

-- CreateIndex
CREATE INDEX "lead_queries_status_idx" ON "lead_queries"("status");

-- AddForeignKey
ALTER TABLE "lead_queries" ADD CONSTRAINT "lead_queries_visitDoneById_fkey" FOREIGN KEY ("visitDoneById") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_queries" ADD CONSTRAINT "lead_queries_meetingDoneById_fkey" FOREIGN KEY ("meetingDoneById") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "query_remarks" ADD CONSTRAINT "query_remarks_queryId_fkey" FOREIGN KEY ("queryId") REFERENCES "lead_queries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "query_remarks" ADD CONSTRAINT "query_remarks_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
