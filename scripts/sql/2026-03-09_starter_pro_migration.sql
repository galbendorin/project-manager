-- ============================================================
-- PM OS: Starter/Trial/Pro Migration + Stripe Columns
-- Run in Supabase SQL Editor BEFORE deploying new code
-- Date: 2026-03-09
-- ============================================================

-- 1) Add Stripe-related columns to user_profiles
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS stripe_customer_id      TEXT,
  ADD COLUMN IF NOT EXISTS subscription_status      TEXT DEFAULT 'free',
  ADD COLUMN IF NOT EXISTS subscription_id          TEXT,
  ADD COLUMN IF NOT EXISTS current_period_end       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancel_at_period_end     BOOLEAN DEFAULT FALSE;

-- 2) Migrate existing users:
--    'trial' users → keep plan as 'trial' but set subscription_status = 'trialing'
--    This preserves their trial_ends date so the countdown still works
UPDATE public.user_profiles
SET subscription_status = 'trialing',
    updated_at = NOW()
WHERE plan = 'trial'
  AND (subscription_status IS NULL OR subscription_status = 'free');

--    'expired' trial users → become 'starter'
UPDATE public.user_profiles
SET plan = 'starter',
    subscription_status = 'free',
    updated_at = NOW()
WHERE plan = 'expired';

--    Existing pro/team users → set subscription_status to match
UPDATE public.user_profiles
SET subscription_status = plan,
    updated_at = NOW()
WHERE plan IN ('pro', 'team')
  AND (subscription_status IS NULL OR subscription_status = 'free');

-- 3) Update the handle_new_user trigger for new signups
--    New users get 90-day free trial with full Pro access
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  -- Insert into profiles (existing table)
  INSERT INTO public.profiles (id, email, created_at)
  VALUES (NEW.id, NEW.email, NOW())
  ON CONFLICT (id) DO NOTHING;

  -- Insert into user_profiles (plan system)
  -- New users start on a 90-day free trial
  INSERT INTO public.user_profiles (
    id,
    plan,
    subscription_status,
    trial_start,
    trial_ends,
    ai_reports_used,
    ai_reports_reset_at,
    created_at,
    updated_at
  ) VALUES (
    NEW.id,
    'trial',
    'trialing',
    NOW(),
    NOW() + INTERVAL '90 days',
    0,
    DATE_TRUNC('month', NOW()),
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4) Verify migration
SELECT
  plan,
  subscription_status,
  COUNT(*) as user_count,
  MIN(trial_ends) as earliest_trial_end,
  MAX(trial_ends) as latest_trial_end
FROM public.user_profiles
GROUP BY plan, subscription_status
ORDER BY plan;
