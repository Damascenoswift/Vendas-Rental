BEGIN;

GRANT USAGE ON SCHEMA public TO service_role;

GRANT ALL ON TABLE public.obra_cards TO authenticated;
GRANT ALL ON TABLE public.obra_card_proposals TO authenticated;
GRANT ALL ON TABLE public.obra_process_items TO authenticated;
GRANT ALL ON TABLE public.obra_comments TO authenticated;
GRANT ALL ON TABLE public.obra_images TO authenticated;

GRANT ALL ON TABLE public.obra_cards TO service_role;
GRANT ALL ON TABLE public.obra_card_proposals TO service_role;
GRANT ALL ON TABLE public.obra_process_items TO service_role;
GRANT ALL ON TABLE public.obra_comments TO service_role;
GRANT ALL ON TABLE public.obra_images TO service_role;

GRANT EXECUTE ON FUNCTION public.is_work_staff(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.can_access_work_card(UUID, UUID) TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
