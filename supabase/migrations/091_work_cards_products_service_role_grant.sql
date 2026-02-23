-- Allow work card snapshot enrichment to read product metadata using service role.
GRANT SELECT ON TABLE public.products TO service_role;
