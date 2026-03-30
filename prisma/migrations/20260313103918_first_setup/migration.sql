-- CreateEnum
CREATE TYPE "GlobalRole" AS ENUM ('SUPER_ADMIN', 'ADMIN', 'USER');

-- CreateEnum
CREATE TYPE "EmployeeStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "Designation" AS ENUM ('SALES_EXECUTIVE', 'TEAM_LEAD', 'SALES_MANAGER', 'AREA_MANAGER', 'DGM', 'GM', 'VP_SALES', 'SALES_COORDINATOR', 'ADMIN');

-- CreateEnum
CREATE TYPE "LeadStatus" AS ENUM ('FRESH', 'FOLLOW_UP', 'NOT_INTERESTED', 'DEAL_DONE', 'RINGING', 'CALL_BACK', 'VISIT_DONE', 'MEETING_DONE', 'WRONG_NUMBER', 'SWITCH_OFF', 'HOT_PROSPECT', 'SUSPECT');

-- CreateEnum
CREATE TYPE "LeadType" AS ENUM ('ALL', 'RENT', 'RESIDENTIAL', 'COMMERCIAL');

-- CreateEnum
CREATE TYPE "LeadSource" AS ENUM ('WEBSITE', 'REFERRAL', 'WALK_IN', 'SOCIAL_MEDIA', 'COLD_CALL', 'NEWSPAPER', 'HOARDING', 'BULK_IMPORT', 'OTHER');

-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('PRESENT_FULL', 'PRESENT_HALF', 'ABSENT');

-- CreateEnum
CREATE TYPE "ExpenseCategory" AS ENUM ('PERSONAL', 'OFFICE');

-- CreateEnum
CREATE TYPE "InventoryType" AS ENUM ('RESIDENTIAL', 'COMMERCIAL');

-- CreateEnum
CREATE TYPE "InventorySubType" AS ENUM ('RENT_RESIDENTIAL', 'RESALE_RESIDENTIAL', 'RENT_COMMERCIAL', 'RESALE_COMMERCIAL');

-- CreateEnum
CREATE TYPE "BHKType" AS ENUM ('TWO_BHK', 'TWO_BHK_STUDY', 'THREE_BHK', 'THREE_BHK_STUDY', 'THREE_BHK_SERVANT', 'THREE_BHK_STORE', 'FOUR_BHK', 'FOUR_BHK_STUDY', 'FOUR_BHK_SERVANT', 'FOUR_BHK_STORE');

-- CreateEnum
CREATE TYPE "FurnishingType" AS ENUM ('RAW_FLAT', 'SEMI_FURNISHED', 'FULLY_FURNISHED');

-- CreateEnum
CREATE TYPE "FieldType" AS ENUM ('TEXT', 'LONG_TEXT', 'NUMBER', 'DECIMAL', 'DROPDOWN', 'MULTI_SELECT', 'DATE', 'DATETIME', 'BOOLEAN', 'PHONE', 'EMAIL', 'URL', 'CURRENCY', 'PERCENTAGE', 'FILE_UPLOAD');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('BIRTHDAY', 'ANNIVERSARY', 'SALE_DONE', 'FOLLOWUP_REMINDER', 'LEAD_ASSIGNED', 'TARGET_ALERT', 'SYSTEM');

-- CreateTable
CREATE TABLE "companies" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "logo" TEXT,
    "themeColor" TEXT DEFAULT '#004aad',
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "settings" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "password" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "globalRole" "GlobalRole" NOT NULL DEFAULT 'USER',
    "lastLoginAt" TIMESTAMP(3),
    "passwordResetToken" TEXT,
    "passwordResetExpires" TIMESTAMP(3),
    "refreshTokenHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employees" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT,
    "phone" TEXT,
    "avatar" TEXT,
    "designation" "Designation" NOT NULL,
    "status" "EmployeeStatus" NOT NULL DEFAULT 'ACTIVE',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "canViewAllFreshLeads" BOOLEAN NOT NULL DEFAULT false,
    "canEditInventory" BOOLEAN NOT NULL DEFAULT false,
    "canAddExpenses" BOOLEAN NOT NULL DEFAULT false,
    "canManageEmployees" BOOLEAN NOT NULL DEFAULT false,
    "canViewAllAttendance" BOOLEAN NOT NULL DEFAULT false,
    "birthday" TIMESTAMP(3),
    "marriageAnniversary" TIMESTAMP(3),
    "dailyCallTarget" INTEGER,
    "monthlySalesTarget" DECIMAL(15,4),
    "reportingManagerId" TEXT,
    "subordinateIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "joinedAt" TIMESTAMP(3),
    "leftAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leads" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "phone2" TEXT,
    "address" TEXT,
    "source" "LeadSource",
    "type" "LeadType" NOT NULL DEFAULT 'RESIDENTIAL',
    "status" "LeadStatus" NOT NULL DEFAULT 'FRESH',
    "isHot" BOOLEAN NOT NULL DEFAULT false,
    "isSuspect" BOOLEAN NOT NULL DEFAULT false,
    "dealDoneAt" TIMESTAMP(3),
    "budgetMin" DECIMAL(15,4),
    "budgetMax" DECIMAL(15,4),
    "budgetUnit" TEXT,
    "projectId" TEXT,
    "assignedToId" TEXT,
    "createdById" TEXT NOT NULL,
    "lastActivityAt" TIMESTAMP(3),
    "assignedAt" TIMESTAMP(3),
    "escalationWarningAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" TIMESTAMP(3),
    "lastWhatsappSentAt" TIMESTAMP(3),
    "bulkImportId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_queries" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "callStatus" "LeadStatus" NOT NULL,
    "remark" TEXT,
    "isAutoRemark" BOOLEAN NOT NULL DEFAULT false,
    "followUpDate" TIMESTAMP(3),
    "visitDate" TIMESTAMP(3),
    "meetingDate" TIMESTAMP(3),
    "dealDoneDate" TIMESTAMP(3),
    "projectId" TEXT,
    "budgetMin" DECIMAL(15,4),
    "budgetMax" DECIMAL(15,4),
    "budgetUnit" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lead_queries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bulk_imports" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "totalRows" INTEGER NOT NULL,
    "successRows" INTEGER NOT NULL DEFAULT 0,
    "failedRows" INTEGER NOT NULL DEFAULT 0,
    "errors" JSONB,
    "fileUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bulk_imports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "source" "LeadSource",
    "createdById" TEXT NOT NULL,
    "assignedToId" TEXT,
    "incentiveAmount" DECIMAL(15,4),
    "dealValue" DECIMAL(15,4),
    "incentiveNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "checkInAt" TIMESTAMP(3),
    "checkInLat" DOUBLE PRECISION,
    "checkInLng" DOUBLE PRECISION,
    "checkInLocation" TEXT,
    "checkOutAt" TIMESTAMP(3),
    "checkOutLat" DOUBLE PRECISION,
    "checkOutLng" DOUBLE PRECISION,
    "checkOutLocation" TEXT,
    "hoursWorked" DECIMAL(5,2),
    "status" "AttendanceStatus",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expenses" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "category" "ExpenseCategory" NOT NULL,
    "title" TEXT NOT NULL,
    "amount" DECIMAL(15,4) NOT NULL,
    "description" TEXT,
    "receiptUrl" TEXT,
    "expenseDate" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "ownerName" TEXT NOT NULL,
    "ownerPhone" TEXT NOT NULL,
    "ownerEmail" TEXT,
    "inventoryType" "InventoryType" NOT NULL,
    "inventorySubType" "InventorySubType" NOT NULL,
    "projectId" TEXT,
    "unitNo" TEXT,
    "towerNo" TEXT,
    "bhk" "BHKType",
    "size" DECIMAL(10,2),
    "facing" TEXT,
    "floor" TEXT,
    "demand" DECIMAL(15,4),
    "hasTenant" BOOLEAN NOT NULL DEFAULT false,
    "hasParking" BOOLEAN NOT NULL DEFAULT false,
    "expectedVisitTime" TEXT,
    "availableDate" TIMESTAMP(3),
    "furnishingType" "FurnishingType",
    "inventoryStatus" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" TIMESTAMP(3),
    "lastEditedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "clientName" TEXT,
    "product" TEXT,
    "sizeInSqft" DECIMAL(10,2),
    "floors" INTEGER,
    "paymentPlan" TEXT,
    "basicSellPrice" DECIMAL(15,4),
    "discount" DECIMAL(5,2),
    "viewPlc" DECIMAL(15,4),
    "cornerPlc" DECIMAL(15,4),
    "floorPlc" DECIMAL(15,4),
    "edc" DECIMAL(15,4),
    "idc" DECIMAL(15,4),
    "ffc" DECIMAL(15,4),
    "otherAdditionalCharges" DECIMAL(15,4),
    "leastRent" DECIMAL(15,4),
    "otherPossessionCharges" DECIMAL(15,4),
    "gstPercent" DECIMAL(5,2),
    "note1" TEXT,
    "note2" TEXT,
    "note3" TEXT,
    "note4" TEXT,
    "powerBackupKva" DECIMAL(8,2),
    "powerBackupPrice" DECIMAL(15,4),
    "onBookingPercent" DECIMAL(5,2),
    "within30DaysPercent" DECIMAL(5,2),
    "onPossessionPercent" DECIMAL(5,2),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "targets" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "callTarget" INTEGER NOT NULL DEFAULT 0,
    "salesTarget" DECIMAL(15,4) NOT NULL DEFAULT 0,
    "callsAchieved" INTEGER NOT NULL DEFAULT 0,
    "salesAchieved" DECIMAL(15,4) NOT NULL DEFAULT 0,
    "visitsAchieved" INTEGER NOT NULL DEFAULT 0,
    "meetingsAchieved" INTEGER NOT NULL DEFAULT 0,
    "dealsAchieved" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "targets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_templates" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "templateText" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "field_definitions" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "fieldKey" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "fieldType" "FieldType" NOT NULL,
    "placeholder" TEXT,
    "helpText" TEXT,
    "options" JSONB,
    "defaultValue" JSONB,
    "isRequired" BOOLEAN NOT NULL DEFAULT false,
    "isVisible" BOOLEAN NOT NULL DEFAULT true,
    "isSearchable" BOOLEAN NOT NULL DEFAULT true,
    "isFilterable" BOOLEAN NOT NULL DEFAULT true,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "isCoreField" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "field_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_field_values" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "fieldDefinitionId" TEXT NOT NULL,
    "textValue" TEXT,
    "numberValue" DECIMAL(15,4),
    "dateValue" TIMESTAMP(3),
    "booleanValue" BOOLEAN,
    "jsonValue" JSONB,
    "searchableValue" TEXT,
    "sortableValue" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lead_field_values_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "createdById" TEXT,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "metadata" JSONB,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_recipients" (
    "id" TEXT NOT NULL,
    "notificationId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),

    CONSTRAINT "notification_recipients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_locations" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "address" TEXT,
    "accuracy" DOUBLE PRECISION,
    "requestedById" TEXT,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "terms_conditions" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "terms_conditions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "terms_acceptances" (
    "id" TEXT NOT NULL,
    "termsId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ipAddress" TEXT,
    "userAgent" TEXT,

    CONSTRAINT "terms_acceptances_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "companies_slug_key" ON "companies"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "employees_userId_key" ON "employees"("userId");

-- CreateIndex
CREATE INDEX "employees_companyId_idx" ON "employees"("companyId");

-- CreateIndex
CREATE INDEX "employees_reportingManagerId_idx" ON "employees"("reportingManagerId");

-- CreateIndex
CREATE INDEX "employees_designation_idx" ON "employees"("designation");

-- CreateIndex
CREATE INDEX "employees_companyId_isActive_idx" ON "employees"("companyId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "employees_userId_companyId_key" ON "employees"("userId", "companyId");

-- CreateIndex
CREATE INDEX "leads_companyId_idx" ON "leads"("companyId");

-- CreateIndex
CREATE INDEX "leads_companyId_status_idx" ON "leads"("companyId", "status");

-- CreateIndex
CREATE INDEX "leads_companyId_assignedToId_idx" ON "leads"("companyId", "assignedToId");

-- CreateIndex
CREATE INDEX "leads_assignedToId_status_idx" ON "leads"("assignedToId", "status");

-- CreateIndex
CREATE INDEX "idx_lead_phone_btree" ON "leads"("phone");

-- CreateIndex
CREATE INDEX "leads_companyId_isActive_idx" ON "leads"("companyId", "isActive");

-- CreateIndex
CREATE INDEX "leads_lastActivityAt_idx" ON "leads"("lastActivityAt");

-- CreateIndex
CREATE INDEX "leads_assignedAt_idx" ON "leads"("assignedAt");

-- CreateIndex
CREATE INDEX "leads_companyId_createdAt_idx" ON "leads"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "lead_queries_leadId_idx" ON "lead_queries"("leadId");

-- CreateIndex
CREATE INDEX "lead_queries_createdById_idx" ON "lead_queries"("createdById");

-- CreateIndex
CREATE INDEX "lead_queries_followUpDate_idx" ON "lead_queries"("followUpDate");

-- CreateIndex
CREATE INDEX "lead_queries_createdAt_idx" ON "lead_queries"("createdAt");

-- CreateIndex
CREATE INDEX "bulk_imports_companyId_idx" ON "bulk_imports"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "customers_leadId_key" ON "customers"("leadId");

-- CreateIndex
CREATE INDEX "customers_companyId_idx" ON "customers"("companyId");

-- CreateIndex
CREATE INDEX "customers_assignedToId_idx" ON "customers"("assignedToId");

-- CreateIndex
CREATE INDEX "attendance_companyId_date_idx" ON "attendance"("companyId", "date");

-- CreateIndex
CREATE INDEX "attendance_employeeId_date_idx" ON "attendance"("employeeId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_employeeId_date_key" ON "attendance"("employeeId", "date");

-- CreateIndex
CREATE INDEX "expenses_companyId_idx" ON "expenses"("companyId");

-- CreateIndex
CREATE INDEX "expenses_createdById_idx" ON "expenses"("createdById");

-- CreateIndex
CREATE INDEX "expenses_expenseDate_idx" ON "expenses"("expenseDate");

-- CreateIndex
CREATE INDEX "inventory_companyId_idx" ON "inventory"("companyId");

-- CreateIndex
CREATE INDEX "inventory_companyId_inventoryType_idx" ON "inventory"("companyId", "inventoryType");

-- CreateIndex
CREATE INDEX "inventory_companyId_isActive_idx" ON "inventory"("companyId", "isActive");

-- CreateIndex
CREATE INDEX "projects_companyId_idx" ON "projects"("companyId");

-- CreateIndex
CREATE INDEX "targets_companyId_month_year_idx" ON "targets"("companyId", "month", "year");

-- CreateIndex
CREATE UNIQUE INDEX "targets_employeeId_month_year_key" ON "targets"("employeeId", "month", "year");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_templates_employeeId_key" ON "whatsapp_templates"("employeeId");

-- CreateIndex
CREATE INDEX "field_definitions_companyId_entityType_idx" ON "field_definitions"("companyId", "entityType");

-- CreateIndex
CREATE UNIQUE INDEX "field_definitions_companyId_entityType_fieldKey_key" ON "field_definitions"("companyId", "entityType", "fieldKey");

-- CreateIndex
CREATE INDEX "lead_field_values_searchableValue_idx" ON "lead_field_values"("searchableValue");

-- CreateIndex
CREATE INDEX "lead_field_values_sortableValue_idx" ON "lead_field_values"("sortableValue");

-- CreateIndex
CREATE UNIQUE INDEX "lead_field_values_leadId_fieldDefinitionId_key" ON "lead_field_values"("leadId", "fieldDefinitionId");

-- CreateIndex
CREATE INDEX "notifications_companyId_idx" ON "notifications"("companyId");

-- CreateIndex
CREATE INDEX "notifications_createdAt_idx" ON "notifications"("createdAt");

-- CreateIndex
CREATE INDEX "notification_recipients_employeeId_idx" ON "notification_recipients"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "notification_recipients_notificationId_employeeId_key" ON "notification_recipients"("notificationId", "employeeId");

-- CreateIndex
CREATE INDEX "staff_locations_employeeId_idx" ON "staff_locations"("employeeId");

-- CreateIndex
CREATE INDEX "terms_conditions_companyId_idx" ON "terms_conditions"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "terms_acceptances_termsId_userId_key" ON "terms_acceptances"("termsId", "userId");

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_reportingManagerId_fkey" FOREIGN KEY ("reportingManagerId") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_bulkImportId_fkey" FOREIGN KEY ("bulkImportId") REFERENCES "bulk_imports"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_queries" ADD CONSTRAINT "lead_queries_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_queries" ADD CONSTRAINT "lead_queries_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_queries" ADD CONSTRAINT "lead_queries_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory" ADD CONSTRAINT "inventory_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory" ADD CONSTRAINT "inventory_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "targets" ADD CONSTRAINT "targets_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "targets" ADD CONSTRAINT "targets_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_templates" ADD CONSTRAINT "whatsapp_templates_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_templates" ADD CONSTRAINT "whatsapp_templates_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_definitions" ADD CONSTRAINT "field_definitions_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_field_values" ADD CONSTRAINT "lead_field_values_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_field_values" ADD CONSTRAINT "lead_field_values_fieldDefinitionId_fkey" FOREIGN KEY ("fieldDefinitionId") REFERENCES "field_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_recipients" ADD CONSTRAINT "notification_recipients_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "notifications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_recipients" ADD CONSTRAINT "notification_recipients_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_locations" ADD CONSTRAINT "staff_locations_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "terms_conditions" ADD CONSTRAINT "terms_conditions_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "terms_acceptances" ADD CONSTRAINT "terms_acceptances_termsId_fkey" FOREIGN KEY ("termsId") REFERENCES "terms_conditions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
