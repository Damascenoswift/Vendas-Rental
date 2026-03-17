-- Migration 111: add additional WhatsApp conversation labels to brand_enum
-- These values are used only by WhatsApp inbox conversation classification.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_enum e ON e.enumtypid = t.oid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
      AND t.typname = 'brand_enum'
      AND e.enumlabel = 'funcionario'
  ) THEN
    ALTER TYPE public.brand_enum ADD VALUE 'funcionario';
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_enum e ON e.enumtypid = t.oid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
      AND t.typname = 'brand_enum'
      AND e.enumlabel = 'diversos'
  ) THEN
    ALTER TYPE public.brand_enum ADD VALUE 'diversos';
  END IF;
END
$$;
