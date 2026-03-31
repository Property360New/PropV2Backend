-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "BHKType" ADD VALUE 'OFFICE_SPACE';
ALTER TYPE "BHKType" ADD VALUE 'STUDIO_APP';
ALTER TYPE "BHKType" ADD VALUE 'SOCIETY_SHOP';
ALTER TYPE "BHKType" ADD VALUE 'RETAIL_SHOP';
ALTER TYPE "BHKType" ADD VALUE 'INDUSTRIAL_LAND';
ALTER TYPE "BHKType" ADD VALUE 'COMMERCIAL_LAND';
