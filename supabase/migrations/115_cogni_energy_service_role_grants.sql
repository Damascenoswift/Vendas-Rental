-- Migration 115: grant service_role access required by COGNI sync

GRANT USAGE ON SCHEMA public TO service_role;

DO $$
DECLARE
  target_table TEXT;
  target_tables TEXT[] := ARRAY[
    'usinas',
    'energia_ucs',
    'faturas_conciliacao',
    'alocacoes_clientes',
    'historico_producao',
    'energia_alocacoes_ucs',
    'energia_credito_transferencias',
    'energia_credito_consumos'
  ];
BEGIN
  FOREACH target_table IN ARRAY target_tables LOOP
    IF to_regclass('public.' || target_table) IS NOT NULL THEN
      EXECUTE format('GRANT ALL ON TABLE public.%I TO service_role', target_table);
    END IF;
  END LOOP;
END
$$;
