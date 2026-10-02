# Private contact service

The shipped app keeps the local profile in the Windows user's SQLite database. It is not an online account or a shared customer directory. No existing profile email is uploaded automatically.

Prepared integration: [schema](../server/supabase/schema.sql) and [Edge Function](../server/supabase/functions/buddy-contact/index.ts). No Supabase project has been created or deployed. The template sends real HTTPS requests when deployed; it has no mock delivery mode.

## Owner setup

1. Create a Supabase project in an account you control. Run `server/supabase/schema.sql` in its SQL editor.
2. Configure a verified sending domain with Resend. `artmarket.vm@gmail.com` is the **recipient**, not a verified application sender. Set `CONTACT_FROM` to your verified sender address.
3. Set **server-only** function secrets: `RESEND_API_KEY`, `CONTACT_FROM`, `CONTACT_PUBLIC_URL` (the deployed function's HTTPS URL). Supabase supplies `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` inside the function. Never put these secrets in Git, `.env.example`, the desktop app or GitHub Actions for desktop builds.
4. Deploy `buddy-contact` with the provided function configuration. The endpoint allows anonymous submissions; the database does not. Input validation and atomic database rate caps bound traffic to 100 email attempts/hour globally and three/hour per address/kind. Configure your gateway's abuse protection and adjust limits for the intended audience before opening the service broadly.
5. In Buddy, open Settings → Connected services → Advanced → Private contact service URL. Save `https://YOUR_PROJECT.supabase.co/functions/v1/buddy-contact`. Alternatively set the runtime `CONTACT_API_URL` environment variable. A URL contains no private credentials. Reopen the feedback card or profile after changing the connection.
6. Test feedback, subscription and research confirmations, repeated/expired links, unsubscribe and research removal. Verify anonymous and signed-in database reads/writes are denied. These cloud checks cannot be performed until the project exists.

Use multi-factor authentication for owner accounts and restrict administrative access to people who manage the service. The public repository contains source and schema only, never subscriber data.

## Data and consent

- `buddy_feedback`: optional suggestion and reply address, creation and delivery timestamps. These addresses are **not** marketing subscribers.
- `buddy_subscribers`: email, separate marketing and role-research confirmations, and role/app fields. For marketing, export only rows with `confirmed_at` set and `unsubscribed_at` null. For research, export only rows with `research_confirmed_at` set. Neither consent implies the other.
- Research fields: `role_id`, `custom_role`, `applications`, `research_confirmed_at` and `research_consent_version`. A request stores only private pending data; verified fields change after confirmation. Declared apps are user-entered names, never detected app inventory, window titles or activity. Up to 20 names, each at most 80 characters; custom roles are required for Other and limited to 120 characters.
- `buddy_unsubscribe_tokens`: hashed unsubscribe tokens. Previously issued unsubscribe links remain valid after new subscription requests. Tokens are random, plaintext values exist only in confirmation emails.
- `buddy_contact_limits`: hourly rate counters. Delete counters older than 48 hours on a server schedule; remove expired unconfirmed subscriptions according to your retention policy.
- RLS is enabled on all tables; `anon` and `authenticated` have no table access. The backend's service role handles writes and the owner uses the protected dashboard/SQL editor for exports.
- The subscription checkbox is optional and separate from the local privacy acknowledgement, tracking and AI sharing. It is disabled when no service is connected. Choosing it does not submit anything until the user requests confirmation.
- Confirmation links show a page first; only its button POST changes consent. Email-link scanners cannot subscribe or unsubscribe by fetching a URL.
- Feedback uses a fixed recipient, plain-text bodies and no app activity context. No server response body or credential is shown in desktop errors.

## Desktop/server contract

`POST` the configured HTTPS endpoint with JSON:

```json
{ "kind": "feedback", "message": "A suggestion", "reply_email": "" }
```

Return HTTP 202 with `{"status":"accepted"}` after the mail provider accepts delivery. A missing provider or failed request must return an error, never a success. Failed deliveries may leave a private feedback row with `delivered_at = null`; inspect these rows before manually retrying. The template does not run a background retry queue.

```json
{ "kind": "subscribe", "email": "user@example.com", "consent": true }
```

Return HTTP 202 with `{"status":"confirmation_required"}` after a verification email is accepted. Confirmation tokens expire in 24 hours. A request alone does not add a new address to the confirmed mailing list. Every future campaign must include a working unsubscribe link and use only the confirmed, active export.

```json
{
  "kind": "role_research",
  "email": "user@example.com",
  "consent": true,
  "role": "other",
  "custom_role": "Musician",
  "applications": ["Ableton Live", "Canva"]
}
```

Return HTTP 202 with `{"status":"confirmation_required"}` only after the verification email is accepted. Confirmation updates research fields in the same protected subscriber row without adding marketing consent. Research removal clears those fields without unsubscribing marketing; unsubscribe changes marketing consent without deleting verified research. The verification email contains the relevant removal link. All link GETs display a confirmation form; only its POST mutates data. A single address has one pending confirmation purpose, so the latest subscription or research request replaces its previous pending request. Existing confirmed consent is retained until its corresponding removal/unsubscribe action.

In the app, expand **Help us understand your role (optional)**, choose its separate consent and explicitly request confirmation. Saving the local profile or selecting Other does not upload anything. Configure the service URL and reopen the profile to enable this control. With no endpoint, the feedback card opens an email draft to **artmarket.vm@gmail.com**. The user reviews and sends it in their email app. Buddy never claims that opening a draft sent a message.

This integration does not implement online authentication, synchronization of goals, or a shared AI proxy. Those need separate backend endpoints and account design.

References: [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [securing data](https://supabase.com/docs/guides/database/secure-data), [function configuration](https://supabase.com/docs/guides/functions/function-configuration), [Resend email API](https://resend.com/docs/api-reference/emails/send-email).
