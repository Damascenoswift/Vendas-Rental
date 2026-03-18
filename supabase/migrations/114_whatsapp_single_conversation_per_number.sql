BEGIN;

CREATE TEMP TABLE _wa_conv_ranked ON COMMIT DROP AS
SELECT
  c.id,
  c.account_id,
  c.customer_wa_id,
  ROW_NUMBER() OVER (
    PARTITION BY c.account_id, c.customer_wa_id
    ORDER BY
      CASE WHEN c.status <> 'CLOSED' THEN 0 ELSE 1 END,
      CASE WHEN c.assigned_user_id IS NOT NULL THEN 0 ELSE 1 END,
      COALESCE(c.last_message_at, c.updated_at, c.created_at) DESC,
      c.updated_at DESC,
      c.created_at DESC,
      c.id DESC
  ) AS rn
FROM public.whatsapp_conversations c;

CREATE TEMP TABLE _wa_conv_merge_map ON COMMIT DROP AS
SELECT
  duplicate_row.id AS duplicate_id,
  canonical_row.id AS canonical_id
FROM _wa_conv_ranked duplicate_row
JOIN _wa_conv_ranked canonical_row
  ON canonical_row.account_id = duplicate_row.account_id
 AND canonical_row.customer_wa_id = duplicate_row.customer_wa_id
 AND canonical_row.rn = 1
WHERE duplicate_row.rn > 1;

CREATE TEMP TABLE _wa_conv_group_members ON COMMIT DROP AS
SELECT canonical_id, duplicate_id AS conversation_id
FROM _wa_conv_merge_map
UNION ALL
SELECT DISTINCT canonical_id, canonical_id
FROM _wa_conv_merge_map;

UPDATE public.whatsapp_messages message_row
SET conversation_id = map.canonical_id
FROM _wa_conv_merge_map map
WHERE message_row.conversation_id = map.duplicate_id;

UPDATE public.whatsapp_conversation_events event_row
SET conversation_id = map.canonical_id
FROM _wa_conv_merge_map map
WHERE event_row.conversation_id = map.duplicate_id;

DO $$
BEGIN
  IF to_regclass('public.whatsapp_conversation_access') IS NOT NULL THEN
    INSERT INTO public.whatsapp_conversation_access (
      conversation_id,
      user_id,
      granted_by_user_id,
      created_at
    )
    SELECT
      map.canonical_id,
      access_row.user_id,
      access_row.granted_by_user_id,
      access_row.created_at
    FROM public.whatsapp_conversation_access access_row
    JOIN _wa_conv_merge_map map
      ON map.duplicate_id = access_row.conversation_id
    ON CONFLICT (conversation_id, user_id) DO UPDATE
    SET
      granted_by_user_id = COALESCE(
        public.whatsapp_conversation_access.granted_by_user_id,
        EXCLUDED.granted_by_user_id
      ),
      created_at = LEAST(
        public.whatsapp_conversation_access.created_at,
        EXCLUDED.created_at
      );
  END IF;
END;
$$;

UPDATE public.whatsapp_conversations canonical
SET
  contact_id = COALESCE(
    canonical.contact_id,
    (
      SELECT candidate.contact_id
      FROM _wa_conv_group_members member
      JOIN public.whatsapp_conversations candidate
        ON candidate.id = member.conversation_id
      WHERE member.canonical_id = canonical.id
        AND candidate.contact_id IS NOT NULL
      ORDER BY
        CASE WHEN candidate.assigned_user_id IS NOT NULL THEN 0 ELSE 1 END,
        COALESCE(candidate.last_message_at, candidate.updated_at, candidate.created_at) DESC,
        candidate.updated_at DESC,
        candidate.created_at DESC,
        candidate.id DESC
      LIMIT 1
    )
  ),
  customer_name = COALESCE(
    NULLIF(BTRIM(canonical.customer_name), ''),
    (
      SELECT candidate.customer_name
      FROM _wa_conv_group_members member
      JOIN public.whatsapp_conversations candidate
        ON candidate.id = member.conversation_id
      WHERE member.canonical_id = canonical.id
        AND NULLIF(BTRIM(candidate.customer_name), '') IS NOT NULL
      ORDER BY
        CASE WHEN candidate.assigned_user_id IS NOT NULL THEN 0 ELSE 1 END,
        COALESCE(candidate.last_message_at, candidate.updated_at, candidate.created_at) DESC,
        candidate.updated_at DESC,
        candidate.created_at DESC,
        candidate.id DESC
      LIMIT 1
    )
  ),
  brand = COALESCE(
    canonical.brand,
    (
      SELECT candidate.brand
      FROM _wa_conv_group_members member
      JOIN public.whatsapp_conversations candidate
        ON candidate.id = member.conversation_id
      WHERE member.canonical_id = canonical.id
        AND candidate.brand IS NOT NULL
      ORDER BY
        CASE WHEN candidate.assigned_user_id IS NOT NULL THEN 0 ELSE 1 END,
        COALESCE(candidate.last_message_at, candidate.updated_at, candidate.created_at) DESC,
        candidate.updated_at DESC,
        candidate.created_at DESC,
        candidate.id DESC
      LIMIT 1
    )
  ),
  assigned_user_id = COALESCE(
    canonical.assigned_user_id,
    (
      SELECT candidate.assigned_user_id
      FROM _wa_conv_group_members member
      JOIN public.whatsapp_conversations candidate
        ON candidate.id = member.conversation_id
      WHERE member.canonical_id = canonical.id
        AND candidate.assigned_user_id IS NOT NULL
      ORDER BY
        COALESCE(candidate.last_message_at, candidate.updated_at, candidate.created_at) DESC,
        candidate.updated_at DESC,
        candidate.created_at DESC,
        candidate.id DESC
      LIMIT 1
    )
  ),
  status = COALESCE(
    (
      SELECT candidate.status
      FROM _wa_conv_group_members member
      JOIN public.whatsapp_conversations candidate
        ON candidate.id = member.conversation_id
      WHERE member.canonical_id = canonical.id
        AND candidate.status <> 'CLOSED'
      ORDER BY
        CASE candidate.status
          WHEN 'OPEN' THEN 0
          WHEN 'PENDING_BRAND' THEN 1
          ELSE 2
        END,
        COALESCE(candidate.last_message_at, candidate.updated_at, candidate.created_at) DESC,
        candidate.updated_at DESC,
        candidate.created_at DESC,
        candidate.id DESC
      LIMIT 1
    ),
    'CLOSED'
  ),
  unread_count = COALESCE(
    (
      SELECT SUM(COALESCE(candidate.unread_count, 0))::integer
      FROM _wa_conv_group_members member
      JOIN public.whatsapp_conversations candidate
        ON candidate.id = member.conversation_id
      WHERE member.canonical_id = canonical.id
    ),
    canonical.unread_count
  ),
  last_message_at = COALESCE(
    (
      SELECT MAX(candidate.last_message_at)
      FROM _wa_conv_group_members member
      JOIN public.whatsapp_conversations candidate
        ON candidate.id = member.conversation_id
      WHERE member.canonical_id = canonical.id
    ),
    canonical.last_message_at
  ),
  window_expires_at = COALESCE(
    (
      SELECT MAX(candidate.window_expires_at)
      FROM _wa_conv_group_members member
      JOIN public.whatsapp_conversations candidate
        ON candidate.id = member.conversation_id
      WHERE member.canonical_id = canonical.id
    ),
    canonical.window_expires_at
  )
WHERE canonical.id IN (
  SELECT DISTINCT canonical_id
  FROM _wa_conv_merge_map
);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'whatsapp_conversations'
      AND column_name = 'is_restricted'
  ) THEN
    EXECUTE '
      UPDATE public.whatsapp_conversations canonical
      SET is_restricted = COALESCE(canonical.is_restricted, false) OR COALESCE(
        (
          SELECT BOOL_OR(COALESCE(candidate.is_restricted, false))
          FROM _wa_conv_group_members member
          JOIN public.whatsapp_conversations candidate
            ON candidate.id = member.conversation_id
          WHERE member.canonical_id = canonical.id
        ),
        false
      )
      WHERE canonical.id IN (
        SELECT DISTINCT canonical_id
        FROM _wa_conv_merge_map
      )
    ';
  END IF;
END;
$$;

DELETE FROM public.whatsapp_conversations duplicate
USING _wa_conv_merge_map map
WHERE duplicate.id = map.duplicate_id;

DROP INDEX IF EXISTS public.whatsapp_conversations_open_unique_idx;

CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_conversations_account_customer_unique_idx
  ON public.whatsapp_conversations (account_id, customer_wa_id);

NOTIFY pgrst, 'reload schema';

COMMIT;
