-- AlterTable
ALTER TABLE "leads" ADD COLUMN     "isFresh" BOOLEAN NOT NULL DEFAULT true;

-- CreateIndex
CREATE INDEX "lead_queries_leadId_createdById_idx" ON "lead_queries"("leadId", "createdById");

-- CreateIndex
CREATE INDEX "lead_queries_leadId_status_createdAt_idx" ON "lead_queries"("leadId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "leads_companyId_isActive_isFresh_assignedToId_idx" ON "leads"("companyId", "isActive", "isFresh", "assignedToId");

-- CreateIndex
CREATE INDEX "leads_companyId_isActive_isFresh_assignedAt_idx" ON "leads"("companyId", "isActive", "isFresh", "assignedAt");
