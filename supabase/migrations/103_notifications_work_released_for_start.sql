BEGIN;

INSERT INTO public.notification_event_catalog (
  event_key,
  domain,
  label,
  sector,
  default_enabled,
  allow_user_disable,
  is_mandatory
)
VALUES (
  'WORK_RELEASED_FOR_START',
  'OBRA',
  'Projeto liberado para iniciar',
  'obras',
  true,
  true,
  false
)
ON CONFLICT (event_key) DO UPDATE
SET
  domain = EXCLUDED.domain,
  label = EXCLUDED.label,
  sector = EXCLUDED.sector,
  default_enabled = EXCLUDED.default_enabled,
  allow_user_disable = EXCLUDED.allow_user_disable,
  is_mandatory = EXCLUDED.is_mandatory,
  updated_at = now();

INSERT INTO public.notification_default_rules (
  sector,
  event_key,
  responsibility_kind,
  enabled
)
VALUES (
  'obras',
  'WORK_RELEASED_FOR_START',
  'SECTOR_MEMBER',
  true
)
ON CONFLICT (sector, event_key, responsibility_kind) DO UPDATE
SET
  enabled = EXCLUDED.enabled,
  updated_at = now();

COMMIT;
