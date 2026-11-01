-- Pro inclut « Tout Premium » : sa limite de photos ne peut pas être inférieure à celle de Premium.
-- Corrige les configurations historiques qui affichaient « 2 photos par article » pour Pro.
UPDATE platform_settings
SET subscription_plan_features = jsonb_set(
  subscription_plan_features::jsonb,
  '{productPhotoLimit}',
  '6'::jsonb,
  true
)::text
WHERE subscription_plan_features IS NOT NULL
  AND (subscription_plan_features::jsonb->>'productPhotoLimit') ~ '^[0-9]+$'
  AND (subscription_plan_features::jsonb->>'productPhotoLimit')::int < 5;

UPDATE shops
SET subscription_features_snapshot = jsonb_set(
  subscription_features_snapshot::jsonb,
  '{productPhotoLimit}',
  '6'::jsonb,
  true
)::text
WHERE subscription_features_snapshot IS NOT NULL
  AND (subscription_features_snapshot::jsonb->>'productPhotoLimit') ~ '^[0-9]+$'
  AND (subscription_features_snapshot::jsonb->>'productPhotoLimit')::int < 5;
