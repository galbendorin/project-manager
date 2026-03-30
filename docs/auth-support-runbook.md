# Auth Support Runbook

## Core checks
- Confirm the app URL and auth redirect URL both point to the live PM Workspace domain.
- Confirm email verification and password reset emails are being delivered through the configured SMTP provider.
- Review Supabase Auth session settings after every major auth change:
  - JWT expiry
  - inactivity timeout
  - single-session policy
  - refresh/session persistence

## Support scenarios
### User did not receive verification email
- Ask them to check spam/junk.
- Ask them to wait 60 seconds before requesting another email.
- Confirm SMTP delivery is healthy in Supabase and the mail provider.
- Use the in-app resend verification action rather than recreating the account.

### User did not receive password reset email
- Check whether the request hit provider throttling.
- Confirm SMTP delivery health.
- Ask the user to wait a minute before retrying.
- If repeated failures appear, verify the live redirect URL and Supabase email template configuration.

### User keeps getting logged out
- Reproduce on Safari and Chrome.
- Check Supabase session/JWT settings first.
- Check whether the browser/app is running in private mode.
- Confirm the session survives backgrounding and reopening the tab/app.

### User signed up from an invite but cannot see the project
- Confirm the email used for signup matches the invited email exactly.
- Confirm the pending invite still exists and was not revoked.
- Confirm the latest project-sharing SQL migration has been applied.
- Ask the user to sign out and sign back in once so pending-invite acceptance runs again.

## Smoke test pack
- Create 5 test accounts.
- Run signup, verification, login, password reset, logout/login again.
- Test invite existing-account flow.
- Test invite-then-signup flow.
- Test same-day access with 2–5 collaborators on one project.
