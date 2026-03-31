-- CreateEnum
CREATE TYPE "EmployeeType" AS ENUM ('EMPLOYEE', 'PNL', 'CHANNEL_PARTNER');

-- AlterTable
ALTER TABLE "employees" ADD COLUMN     "aadhaarNumber" TEXT,
ADD COLUMN     "emergencyContact" TEXT,
ADD COLUMN     "employeeType" "EmployeeType" NOT NULL DEFAULT 'EMPLOYEE',
ADD COLUMN     "panNumber" TEXT;
