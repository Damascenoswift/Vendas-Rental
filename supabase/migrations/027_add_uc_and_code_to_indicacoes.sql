
-- Add unidade_consumidora and codigo_cliente to indicacoes table
ALTER TABLE "public"."indicacoes" ADD COLUMN "unidade_consumidora" text;
ALTER TABLE "public"."indicacoes" ADD COLUMN "codigo_cliente" text;
