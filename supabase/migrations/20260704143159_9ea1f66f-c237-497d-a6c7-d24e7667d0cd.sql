
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS paddle_customer_id text,
  ADD COLUMN IF NOT EXISTS paddle_subscription_id text,
  ADD COLUMN IF NOT EXISTS cancel_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_paddle_sub_uniq
  ON public.subscriptions(paddle_subscription_id)
  WHERE paddle_subscription_id IS NOT NULL;
