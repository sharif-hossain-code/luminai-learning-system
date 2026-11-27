# Web and identity security

How the Phase 2 identity features protect accounts. Update this file whenever these controls change.

## Request path

```
Browser ──same origin──▶ Next.js web app ──/api/v1/* proxy──▶ NestJS API ──▶ Postgres / Redis
```

- The browser only talks to the web app. `apps/web/src/app/api/v1/[...path]/route.ts` forwards `/api/v1/*` to `API_URL` at request time, so the session cookie is first-party and the API needs no CORS for the web app.
- The proxy forwards only an allow-list of headers (cookie, content type, origin, user agent, CSRF header, request ID, `x-forwarded-for`) and returns `set-cookie`, `retry-after` and the request ID.
- **Client IP.** The API reads `x-forwarded-for` only from addresses in `TRUST_PROXY` (default `loopback`, which covers the web app on the same host). In production the load balancer in front of the web app must set `x-forwarded-for`, and `TRUST_PROXY` must list the web app's addresses. Otherwise every request looks like it comes from the web server and IP rate limits become global.

## Sessions

- Opaque random tokens (32 bytes, base64url). Only a SHA-256 hash is stored in `sessions`.
- Cookie: `luminai_session` in development and test, `__Host-luminai_session` in production. `HttpOnly`, `SameSite=Lax`, `Path=/`, `Secure` in production, 30-day expiry (`SESSION_TTL_DAYS`).
- `lastSeenAt` is updated at most every 5 minutes.
- Signed-in pages are gated twice: `apps/web/src/proxy.ts` redirects requests without a cookie to sign-in, and the `(app)` layout asks the API for `/users/me`, so an expired or revoked cookie is never trusted.
- Password change rotates the current session and revokes all others. Password reset revokes every session. Suspending a user revokes their sessions.
- Users can list their sessions (browser and OS only, no location), sign out one, or sign out everywhere else.

## CSRF

- Every unsafe method (`POST`, `PATCH`, `PUT`, `DELETE`) must send `x-luminai-csrf: 1`. Browsers can't add custom headers to cross-site form posts, and cross-origin `fetch` with a custom header needs a CORS preflight that the API refuses for other origins.
- If an `Origin` header is present it must equal `WEB_URL`.
- `SameSite=Lax` on the cookie is a second layer.
- The web app's `apiFetch` (`apps/web/src/lib/api-client.ts`) adds the header automatically.

## Passwords

- Argon2id (m=19456 KiB, t=2, p=1), rehashed on sign-in when parameters change.
- Rules (`packages/contracts/src/password-policy.ts`, shared by the API and the live rules in the UI): 12 to 128 characters, not on a common-password list, not a repeated character, and not containing the email local part or a word of the display name (4+ characters). No composition rules.
- The common-password list is a short placeholder. **Before launch** replace it with a breached-password check (k-anonymity range API).

## Account enumeration

- Register, resend verification and forgot password always return `202` with the same body. When the email is already registered, the owner gets an "account exists" email instead.
- Sign-in returns the same error for an unknown email and a wrong password, and runs a dummy hash for unknown emails to keep timing similar.
- "Email not verified" is only reported after the correct password.

## One-time tokens

- Verification (24 h) and reset (1 h) tokens are random, stored as SHA-256 hashes, single-use, and invalidated when a new one is issued.
- Email jobs carry only `{ type, userId }`; the worker creates the token, so tokens never sit in Redis.
- The web pages remove the token from the address bar (`history.replaceState`) as soon as they read it, and `Referrer-Policy: strict-origin-when-cross-origin` keeps it out of `Referer`.
- Expired, used and malformed tokens give the same answer.

## Rate limits

Redis fixed windows, keys hashed with SHA-256 so emails and IPs never appear in Redis. Exceeding a limit returns `429` with `Retry-After`. If Redis is down, limits fail open (logged) so sign-in keeps working.

| Endpoint            | Limits                                |
| ------------------- | ------------------------------------- |
| Register            | 10/h per IP, 3/h per email            |
| Verify email        | 20 per 15 min per IP                  |
| Resend verification | 10/h per IP, 1/min per email          |
| Sign in             | 50/15 min per IP, 10/15 min per email |
| Forgot password     | 10/h per IP, 1/min per email          |
| Reset password      | 10 per 15 min per IP                  |
| Change password     | 5 per 15 min per user                 |

## Audit log

`audit_events` records sign-ins (success and failure), sign-outs, session revocations, verification, password reset and change, and admin role and status changes. IPs are stored as HMAC hashes keyed with `SESSION_SECRET`.

## Not yet done

- Content Security Policy (the theme script needs a nonce or hash; see A10).
- Multi-factor authentication for admins (pre-production task).
- Account deletion (`DELETE /users/me`) and data export.
- Breached-password check (above).
