-- DropIndex
DROP INDEX "idx_leadquery_leadid_createdby";

-- DropIndex
DROP INDEX "idx_leadquery_leadid_status";

-- DropIndex
DROP INDEX "idx_leadquery_status_createdat";

-- DropIndex
DROP INDEX "idx_lead_company_active_assigned";

-- DropIndex
DROP INDEX "idx_lead_company_activity";

-- DropIndex
DROP INDEX "idx_lead_company_assigned_at";

-- DropIndex
DROP INDEX "idx_lead_email_trgm";

-- DropIndex
DROP INDEX "idx_lead_name_trgm";

-- DropIndex
DROP INDEX "idx_lead_phone_trgm";

-- CreateTable
CREATE TABLE "deals" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "queryId" TEXT NOT NULL,
    "leadActualSlab" DECIMAL(15,4),
    "discount" DECIMAL(15,4),
    "actualRevenue" DECIMAL(15,4),
    "incentiveSlab" DECIMAL(8,4),
    "salesRevenue" DECIMAL(15,4),
    "incentiveAmount" DECIMAL(15,4),
    "dealValue" DECIMAL(15,4),
    "incentiveNote" TEXT,
    "closingAmount" DECIMAL(15,4),
    "unitNo" TEXT,
    "dealDoneDate" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "assignedToId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "deals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "deals_queryId_key" ON "deals"("queryId");

-- CreateIndex
CREATE INDEX "deals_companyId_idx" ON "deals"("companyId");

-- CreateIndex
CREATE INDEX "deals_customerId_idx" ON "deals"("customerId");

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_queryId_fkey" FOREIGN KEY ("queryId") REFERENCES "lead_queries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;
