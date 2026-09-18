# ReserveFlow

ReserveFlow is a multi-vendor reservation platform frontend for boutique stays, workspaces, and healthcare appointments. This first milestone is an interactive static product demo, designed to deploy directly to GitHub Pages.

## Current frontend experience

- Responsive discovery landing page with curated inventory
- Live-style availability counter and date selection
- Guest controls, saved listings, and mobile navigation
- Reservation summary modal that models the handoff to checkout
- Static hosting configuration for GitHub Pages

## Planned production architecture

```text
React client  →  NestJS API  →  PostgreSQL (constraints + transactions)
                    │                  │
                    ├── Redis (locks, rate limits, queues)
                    ├── Socket.io (live availability)
                    └── Stripe webhooks (idempotent payment events)
```

The frontend uses mocked data intentionally until the API contract, authentication model, reservation state machine, and database constraints are designed in the backend phase.

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
