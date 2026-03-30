-- DropIndex
DROP INDEX "expenses_companyId_idx";

-- DropIndex
DROP INDEX "expenses_createdById_idx";

-- DropIndex
DROP INDEX "expenses_expenseDate_idx";

-- CreateIndex
CREATE INDEX "expenses_companyId_expenseDate_idx" ON "expenses"("companyId", "expenseDate" DESC);

-- CreateIndex
CREATE INDEX "expenses_companyId_createdById_idx" ON "expenses"("companyId", "createdById");

-- CreateIndex
CREATE INDEX "expenses_companyId_category_idx" ON "expenses"("companyId", "category");

-- CreateIndex
CREATE INDEX "expenses_companyId_subCategory_idx" ON "expenses"("companyId", "subCategory");

-- CreateIndex
CREATE INDEX "expenses_companyId_createdById_expenseDate_idx" ON "expenses"("companyId", "createdById", "expenseDate" DESC);

-- CreateIndex
CREATE INDEX "expenses_companyId_category_subCategory_expenseDate_idx" ON "expenses"("companyId", "category", "subCategory", "expenseDate" DESC);
