# ReserveFlow project status

**Current stage:** pre-launch accommodation marketplace, ready for a controlled pilot—not yet ready for live public payments.

## Completed product capabilities

- Guest registration, sign-in, password recovery, email verification, and verification resend flow
- Guest reservation dashboard with wallet credits, cancellation, live status, audit timeline, and verified post-stay reviews
- Reviewed host applications, host studio, inventory management, photo galleries, availability blocks, and booking inbox
- Owner workspace for approving hosts/listings, reviewing audit history, suspending listings, handling support cases, and issuing controlled booking credits
- Search and discovery by city/area/country, with coordinate support for future nearby discovery
- Server-owned pricing and 15-minute holds; clients never choose a final charge amount
- PostgreSQL exclusion constraint and transactional row locking to prevent overlapping active stays
- Paystack **test-mode** checkout, idempotent payment initiation, signed webhook verification, and late-payment reconciliation handling
- Cloudinary image uploads, public policies/support centre, abuse limits on sensitive public routes, and API/database readiness checks
- Reservation state-machine controls, including arrival/checkout date safeguards for host actions
- Request correlation IDs in API headers, errors, and structured logs for support investigation

## Still intentionally restricted

- Live payment collection and payout
- Customer cash deposits, transfers, withdrawals, and stored money
- Automatic refunds and mixed credit/card payment
- Non-NGN payments, settlement, and public operations outside Nigeria
- Multi-instance rate limiting (current limiter is deliberately process-local)

## When it is time to provide a domain

Provide a domain when you are ready to start the **external-services launch phase**. At that point, we will need the final names for:

```text
Website: https://www.your-domain.com
API:     https://api.your-domain.com
Email:   no-reply@your-domain.com
```

The domain unlocks Brevo transactional-email approval, trusted password/verification links, a branded Netlify site URL, and a branded Render API URL. Do not buy or configure it just to continue local product development; it is needed when you are ready to test real email delivery and prepare the business for pilot launch.

## Final launch gate

The project can be described as **launch-ready** only after all of these are complete:

1. Domain, sender address, and Brevo domain authentication are active.
2. Render runs on an always-on plan with a scheduled hold-expiry worker.
3. Paystack business verification and live settlement account are complete; test keys are replaced only after an end-to-end sandbox regression test.
4. Nigerian legal review is complete for terms, privacy, cancellation/refund policy, host agreement, and data handling.
5. Monitoring, backup/recovery checks, and a written support escalation process are active.
6. A small closed Kuje pilot has successfully exercised booking, payment, cancellation, support, host check-in, and property suspension.

Until then, call the product a **secure pre-launch pilot** and keep all real-money features disabled.
