# HeadStone

## Backend Email Foundation

The Django backend now has one reusable outbound email path in `backend/communications/`.

- Service entrypoint: `communications.services.send_email(...)`
- Current provider: `django`
- Current provider implementation: Django's configured email backend

### Local / Dev Behavior

By default, email stays development-safe:

- `EMAIL_PROVIDER=django`
- `EMAIL_BACKEND=django.core.mail.backends.console.EmailBackend`

With that setup, outbound emails are printed to the Django console instead of being delivered.

### Production Configuration

Set these environment variables in production:

- `EMAIL_PROVIDER=django`
- `DEFAULT_FROM_EMAIL`
- `PANEL_FROM_EMAIL`
- `INVITE_FROM_EMAIL`
- `EMAIL_DEFAULT_REPLY_TO`
- `EMAIL_BACKEND`
- `EMAIL_HOST`
- `EMAIL_PORT`
- `EMAIL_HOST_USER`
- `EMAIL_HOST_PASSWORD`
- `EMAIL_USE_TLS`
- `EMAIL_TIMEOUT_SECONDS`

Typical SMTP production setup:

```env
EMAIL_PROVIDER=django
EMAIL_BACKEND=django.core.mail.backends.smtp.EmailBackend
DEFAULT_FROM_EMAIL=ops@example.com
PANEL_FROM_EMAIL=ops@example.com
INVITE_FROM_EMAIL=ops@example.com
EMAIL_DEFAULT_REPLY_TO=support@example.com
EMAIL_HOST=smtp.example.com
EMAIL_PORT=587
EMAIL_HOST_USER=smtp-user
EMAIL_HOST_PASSWORD=super-secret
EMAIL_USE_TLS=1
EMAIL_TIMEOUT_SECONDS=10
```

### Notes

- Logging is emitted for successful and failed outbound sends.
- The provider abstraction is intentionally small so additional providers can be added later without changing callers.
- Employee invites have been routed through the shared send path, but invite workflow changes are not part of this pass.

## Employee Invite Flow

Employee account invites are handled entirely in the backend.

- Employee creation endpoint: `POST /api/manage/employees/create/`
- Optional create flag: `send_invite` (defaults to `true`)
- Resend endpoint: `POST /api/manage/employees/<employee_id>/invite/resend/`
- Password setup endpoints:
  - `GET /api/auth/password-setup/?token=...`
  - `POST /api/auth/password-setup/`

Behavior:

- Invites use a random token and expire after `INVITE_EXPIRY_HOURS` (default `72`).
- Resending an invite revokes any previous active invite before issuing a new token.
- Used, expired, revoked, and unknown tokens are all rejected with the same generic message: `Invite is invalid or expired.`
- Invite emails are sent through the shared `communications.services.send_email(...)` path.

Invite URL generation:

- Production: set `EMAIL_FRONTEND_BASE_URL`
- Local fallback: request `Origin`, then Django static URL fallback

Example:

```env
EMAIL_FRONTEND_BASE_URL=https://app.example.com
INVITE_EXPIRY_HOURS=72
```
