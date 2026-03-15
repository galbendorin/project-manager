-- ============================================================
-- PM OS: 90-Day Free Trial Rollout
-- Run in Supabase SQL Editor before deploying 90-day trial copy
-- Date: 2026-03-15
-- ============================================================

-- 1) Extend all current trial users from rollout time
UPDATE public.user_profiles
SET subscription_status = 'trialing',
    trial_ends = NOW() + INTERVAL '90 days',
    updated_at = NOW()
WHERE plan = 'trial';

-- 2) Update the signup trigger so all future users get 90 days
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, created_at)
  VALUES (NEW.id, NEW.email, NOW())
  ON CONFLICT (id) DO NOTHING;

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

-- 3) Verify the rollout
SELECT
  plan,
  subscription_status,
  COUNT(*) AS user_count,
  MIN(trial_ends) AS earliest_trial_end,
  MAX(trial_ends) AS latest_trial_end
FROM public.user_profiles
GROUP BY plan, subscription_status
ORDER BY plan;
