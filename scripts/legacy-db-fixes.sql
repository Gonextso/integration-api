-- Remap deprecated plan keys before schema sync removes enum variants.
UPDATE billings.pricing
SET plan_key = 'COMMUNITY'::tenants."PlanKey"
WHERE plan_key = 'PRO'::tenants."PlanKey";

UPDATE billings.pricing
SET pending_plan_key = 'COMMUNITY'
WHERE pending_plan_key = 'PRO';
