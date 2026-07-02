-- Remap deprecated PRO plan to COMMUNITY before removing the enum variant.
-- Compare via text so this is safe when PRO is not present in the enum.
UPDATE billings.pricing
SET plan_key = 'COMMUNITY'::tenants."PlanKey"
WHERE plan_key::text = 'PRO';

UPDATE billings.pricing
SET pending_plan_key = 'COMMUNITY'
WHERE pending_plan_key = 'PRO';

-- Only rebuild the enum when PRO is still a variant (no-op on fresh/baselined DBs).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    JOIN pg_namespace n ON t.typnamespace = n.oid
    WHERE n.nspname = 'tenants'
      AND t.typname = 'PlanKey'
      AND e.enumlabel = 'PRO'
  ) THEN
    ALTER TYPE tenants."PlanKey" RENAME TO "PlanKey_old";

    CREATE TYPE tenants."PlanKey" AS ENUM ('BASIC', 'COMMUNITY', 'ENTERPRISE');

    ALTER TABLE billings.pricing
      ALTER COLUMN plan_key TYPE tenants."PlanKey"
      USING plan_key::text::tenants."PlanKey";

    DROP TYPE tenants."PlanKey_old";
  END IF;
END $$;
