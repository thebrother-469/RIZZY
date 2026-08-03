ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS preferred_title text;

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_preferred_title_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_preferred_title_check
  CHECK (preferred_title IS NULL OR preferred_title IN ('king','queen','neutral'));

COMMENT ON COLUMN public.profiles.preferred_title IS
  'Explicit, self-selected salutation. NULL or ''neutral'' => neutral greeting (Champion). Never inferred from name, email or any other identifier.';