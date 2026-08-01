-- Fix: Ensure handle_new_user exists before revoking permissions.
-- This migration creates/recreates the function and then properly locks it down.

-- First, ensure the function exists with the correct definition
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER 
LANGUAGE plpgsql 
SECURITY DEFINER 
SET search_path = public 
AS $$
BEGIN
  INSERT INTO public.profiles (id, email) VALUES (NEW.id, NEW.email)
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.subscriptions (user_id, plan) VALUES (NEW.id, 'free')
  ON CONFLICT (user_id) DO NOTHING;
  INSERT INTO public.user_xp (user_id) VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END; 
$$;

-- Now safely revoke permissions (function must exist first)
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- Ensure the trigger is recreated if it doesn't exist
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users 
FOR EACH ROW 
EXECUTE FUNCTION public.handle_new_user();
