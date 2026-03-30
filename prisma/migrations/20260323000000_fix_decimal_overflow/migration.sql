ALTER TABLE "customers" 
  ALTER COLUMN "discount" TYPE DECIMAL(15,4),
  ALTER COLUMN "incentiveSlab" TYPE DECIMAL(8,4);

ALTER TABLE "lead_queries" 
  ALTER COLUMN "discount" TYPE DECIMAL(15,4),
  ALTER COLUMN "incentiveSlab" TYPE DECIMAL(8,4);