-- handle_new_user REVOKE moved to later migration to ensure function exists first
REVOKE EXECUTE ON FUNCTION public.subscriptions_guard() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;
