# Security Release Checklist

## Before wider rollout
- Run dependency review and update any critical packages.
- Review environment variables and confirm no service-role keys are exposed client-side.
- Confirm webhook secrets are present and rotated where needed.
- Confirm the latest Vercel security headers are live in production.
- Confirm Supabase RLS remains enabled for shared project tables.

## API protection
- Verify rate limits are active on:
  - AI generate
  - project invite
  - project access removal
  - checkout session creation
- Verify project sharing no longer reveals whether an invited email already has an account.
- Verify the AI proxy only accepts BYOK keys through request headers.

## Billing and auth
- Verify Stripe webhook signature checking is working in production.
- Verify production logs do not expose customer or user identifiers unnecessarily.
- Verify signup, resend verification, and password reset all work with custom SMTP.
- Verify session persistence on desktop and mobile, including Safari.

## Collaboration
- Verify projects can support up to 5 active editors.
- Verify pending invites attach after signup or sign-in.
- Verify remote project version changes are surfaced before users keep editing stale data.
