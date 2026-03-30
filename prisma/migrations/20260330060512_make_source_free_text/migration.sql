/*
  Warnings:

  - The `source` column on the `customers` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `source` column on the `leads` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- AlterTable
ALTER TABLE "customers" DROP COLUMN "source",
ADD COLUMN     "source" TEXT;

-- AlterTable
ALTER TABLE "leads" DROP COLUMN "source",
ADD COLUMN     "source" TEXT;
