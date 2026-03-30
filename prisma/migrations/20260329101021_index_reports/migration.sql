-- CreateIndex
CREATE INDEX "lead_queries_createdById_createdAt_idx" ON "lead_queries"("createdById", "createdAt");

-- CreateIndex
CREATE INDEX "lead_queries_createdById_status_createdAt_idx" ON "lead_queries"("createdById", "status", "createdAt");

-- CreateIndex
CREATE INDEX "leads_companyId_isActive_status_assignedToId_idx" ON "leads"("companyId", "isActive", "status", "assignedToId");

-- CreateIndex
CREATE INDEX "leads_companyId_isActive_dealDoneAt_idx" ON "leads"("companyId", "isActive", "dealDoneAt");

-- CreateIndex
CREATE INDEX "query_remarks_createdById_createdAt_idx" ON "query_remarks"("createdById", "createdAt");
