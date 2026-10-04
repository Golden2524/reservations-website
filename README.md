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
