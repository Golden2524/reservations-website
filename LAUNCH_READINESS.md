# ReserveFlow launch readiness

ReserveFlow is currently a **pre-launch accommodation marketplace** with an operational test deployment:

- Frontend: `https://reserveflow-kuje.netlify.app`
- API: `https://reserveflow-api-l7bs.onrender.com/api/v1`
- Database-backed readiness check: `https://reserveflow-api-l7bs.onrender.com/api/v1/health/readiness`

Do not describe the service as accepting live commercial bookings until every required item below is complete.

## Already implemented

- Guest accounts, sign-in, password-reset and email-verification flows
- Reviewed host onboarding and property approval
- Secure server-calculated pricing, inventory holds, and database-level double-booking protection
- Paystack sandbox checkout with signed webhook verification
- Owner-issued ReserveFlow Credits that can pay for a booking in full
- Guest cancellation, host arrival/completion actions, verified post-stay reviews, support cases, and owner operations metrics
- Cloudinary property-gallery uploads, country-aware discovery, location search, abuse protection, and API/database readiness monitoring

## Domain cutover checklist

After buying a domain (for example `reserveflow.com`), decide on these names:

```text
Website: https://www.reserveflow.com
API:     https://api.reserveflow.com
Email:   no-reply@reserveflow.com
```

1. Add the website domain in Netlify and update the DNS records Netlify provides.
2. Put the API behind `api.reserveflow.com` through Render custom domains, then update its DNS records.
3. In Render, set `CLIENT_ORIGIN` to the final frontend origins, for example:

   ```text
   https://www.reserveflow.com,https://reserveflow.com,https://reserveflow-kuje.netlify.app
   ```

4. In Netlify, set `VITE_API_BASE_URL=https://api.reserveflow.com/api/v1`, then redeploy.
5. In Render, set `APP_URL=https://www.reserveflow.com` so account-action links lead to your site.
6. Add the domain to Brevo, publish its verification/DKIM/DMARC DNS records, create `no-reply@reserveflow.com`, then set `BREVO_SENDER_EMAIL`, `BREVO_SENDER_NAME`, and `APP_URL` in Render.
7. Reply to Brevo using the requested explanation of the business relationship and sender; ask them to re-review transactional sending.
8. Update the Paystack callback URL and webhook endpoint to the custom domains, then repeat the complete sandbox payment test.

Never put provider secrets, database URLs, API keys, or email credentials in Netlify variables that start with `VITE_`, Git commits, screenshots, or support messages.

## Before live payments

1. Upgrade Render from the free plan to an always-on plan.
2. Run `npm run reservations:expire` on a scheduled worker every minute so stale payment attempts are released even with no visitor traffic.
3. Configure external monitoring for `/api/v1/health/readiness`, error alerts, and a tested database-backup/recovery process.
4. Replace the test Paystack secret with a live secret only after Paystack business verification and settlement-account setup are completed.
5. Have a qualified Nigerian legal adviser approve the Terms, Privacy, cancellation/refund policy, host agreement, and data-handling procedures.
6. Use a shared Redis-backed limiter before running more than one API instance; the current limiter is intentionally process-local.
7. Run a closed pilot with real verified Kuje hosts and guests, including payment, cancellation, support, and operational recovery scenarios.

## Not enabled yet

- Customer cash wallet deposits, withdrawals, transfers, or stored money
- Partial credits plus card/transfer payment for one booking
- Automatic refunds
- Non-NGN settlement or live public listings outside Nigeria

Those are intentionally held back until the relevant provider, legal, reconciliation, and country-by-country operational requirements are complete.
