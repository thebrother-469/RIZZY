
CREATE TABLE IF NOT EXISTS public.paddle_webhook_events (
  event_id text PRIMARY KEY,
  event_type text NOT NULL,
  occurred_at timestamptz,
  received_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.paddle_webhook_events TO service_role;

ALTER TABLE public.paddle_webhook_events ENABLE ROW LEVEL SECURITY;
-- No policies: authenticated/anon have no access; service_role bypasses RLS.
