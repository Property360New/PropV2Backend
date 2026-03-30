-- CreateEnum
CREATE TYPE "QueryPermissionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "companies" ADD COLUMN     "requireQueryPermission" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "actualRevenue" DECIMAL(15,4),
ADD COLUMN     "discount" DECIMAL(5,2),
ADD COLUMN     "incentiveSlab" DECIMAL(5,2),
ADD COLUMN     "leadActualSlab" DECIMAL(15,4),
ADD COLUMN     "salesRevenue" DECIMAL(15,4);

-- AlterTable
ALTER TABLE "field_definitions" ADD COLUMN     "applicableLeadTypes" JSONB;

-- CreateTable
CREATE TABLE "query_permission_requests" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "status" "QueryPermissionStatus" NOT NULL DEFAULT 'PENDING',
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "rejectionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "query_permission_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "query_permission_requests_companyId_status_idx" ON "query_permission_requests"("companyId", "status");

-- CreateIndex
CREATE INDEX "query_permission_requests_leadId_idx" ON "query_permission_requests"("leadId");

-- CreateIndex
CREATE INDEX "query_permission_requests_requestedById_idx" ON "query_permission_requests"("requestedById");

-- AddForeignKey
ALTER TABLE "query_permission_requests" ADD CONSTRAINT "query_permission_requests_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "query_permission_requests" ADD CONSTRAINT "query_permission_requests_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "query_permission_requests" ADD CONSTRAINT "query_permission_requests_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;
