# ReserveFlow

ReserveFlow is a Kuje-first multi-vendor accommodation marketplace for short-let apartments, guest houses, boutique stays, and serviced apartments. The frontend is live as an interactive product demo, while the API is being built as a production-grade booking platform.

## Current frontend experience

- Responsive discovery landing page with curated inventory
- Live-style availability counter and date selection
- Guest controls, saved listings, and mobile navigation
- Reservation summary modal that models the handoff to checkout
- Static hosting configuration for GitHub Pages

## Planned production architecture

```text
React client  →  Express + TypeScript API  →  PostgreSQL (constraints + transactions)
                    │                  │
                    ├── Redis (locks, rate limits, queues)
                    ├── Socket.io (live availability)
                    └── Stripe webhooks (idempotent payment events)
```

The frontend uses mocked data intentionally until the API contract, authentication model, reservation state machine, and database constraints are designed in the backend phase.

## Backend foundation

The API lives in `api/` and is deliberately organised for the upcoming accommodation modules: identity and roles, host properties, room inventory, availability, reservations, payments, notifications, and administration.

The first PostgreSQL migration is at `api/db/migrations/0001_initial_accommodation_schema.sql`. Its range exclusion constraint prevents overlapping active reservations for the same unit, including concurrent checkout attempts. It also stores idempotency keys for booking requests and payment webhooks.

```bash
cd api
npm install
Copy-Item .env.example .env
npm run dev
```

Once running, `GET /api/v1/health` confirms the service is available. Database, Redis, payment, and authentication integrations are added in the next backend milestones so no real booking data is accepted before it is safely persisted.

### Database migrations

After adding the Neon `DATABASE_URL` to `api/.env`, apply the versioned PostgreSQL schema with:

```bash
cd api
npm run db:migrate
```

The migration runner stores a checksum for every applied migration and stops if an already-applied migration is modified.

To validate the double-booking protection against the live database without preserving test data:

```bash
npm run db:verify-booking-safety
```

## API contract (in progress)

The initial public discovery endpoints are now available at `/api/v1/properties` and `/api/v1/properties/:slug/availability`. They accept validated date and guest-count queries and read availability from PostgreSQL rather than the frontend mock state.

`POST /api/v1/reservations` creates a 15-minute inventory hold and is idempotent. It requires a verified bearer token and derives the guest identity from that token; it never trusts a guest ID in the booking request. The PostgreSQL exclusion constraint remains the final guard against double booking.

### Authentication

`POST /api/v1/auth/register` creates a guest account with a bcrypt password hash. `POST /api/v1/auth/login` returns a signed, 15-minute bearer access token. Public registration cannot create host or admin roles; hosts are onboarded through a reviewed business process and administrators are provisioned separately.

### Host supply workflow

Prospective accommodation vendors submit `POST /api/v1/host-applications`; this does **not** grant host access. After an approved onboarding review creates a verified host profile, the protected `/api/v1/host/properties` routes allow that host to create draft properties, add bookable units with naira pricing, and set blackout dates. Properties stay `DRAFT` until administrative quality and safety review activates them for public discovery.

Administrators use `/api/v1/admin/host-applications` to list, approve, or reject vendor applications. Approval atomically upgrades the reviewed applicant to `HOST` and creates a verified host profile. Availability blocks are checked by both public discovery and reservation creation, and unit row locks serialize a host blackout update against a simultaneous hold request.

Hosts submit a draft property through `POST /api/v1/host/properties/:propertyId/submit`; only an administrator can activate it through the property-review API. Guests can retrieve only their own stays at `GET /api/v1/reservations/mine` and cancel eligible holds, unpaid reservations, or confirmed stays with an immutable cancellation event. Payment refunds are deliberately deferred until the payment-provider milestone, so no refund is promised or processed by this API yet.

Every approval and suspension is recorded in `property_review_events`, preserving the reviewer and decision note for operational auditability.

### Payments

`POST /api/v1/payments/checkout` starts a Paystack payment for the signed-in guest's unexpired reservation hold. Charges are calculated only on the server and sent to Paystack in kobo. The endpoint has an idempotency key, so retries reuse the same payment record and provider reference rather than creating a second charge attempt.

`POST /api/v1/payments/paystack/webhook` receives raw Paystack events, validates their HMAC-SHA512 signature, records each provider event once, and confirms the reservation after `charge.success`. Add `PAYSTACK_SECRET_KEY` and an HTTPS `PAYSTACK_CALLBACK_URL` only when you are ready to test checkout; never expose the secret key in the frontend or commit it.

With a test key only, `npm run payments:smoke-test` initializes one sandbox checkout without opening or paying it, then removes the temporary Neon users, property, unit, reservation, and payment records.

Reservation holds and payment attempts each expire after 15 minutes. `npm run reservations:expire` releases stale inventory; reservation creation also clears expired holds for its requested unit before it attempts an insert. When the API is deployed, this command should run on a scheduled worker every minute.

## Run locally

```bash
npm install
npm run dev
```

## Production build

```bash
npm run build
```

The app uses a relative asset base, so its generated `dist` folder works on a GitHub Pages project site without a repository-name-specific configuration.
