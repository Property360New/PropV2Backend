-- AddColumn only if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='leads' AND column_name='clientBirthday'
  ) THEN
    ALTER TABLE "leads" ADD COLUMN "clientBirthday" TIMESTAMP(3);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='leads' AND column_name='clientMarriageAnniversary'
  ) THEN
    ALTER TABLE "leads" ADD COLUMN "clientMarriageAnniversary" TIMESTAMP(3);
  END IF;
END $$;