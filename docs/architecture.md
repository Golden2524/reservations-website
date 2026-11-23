# ReserveFlow architecture

ReserveFlow is designed as a marketplace where browsers never decide availability, prices, booking status, or payment success. Those decisions belong to the API and PostgreSQL transaction boundary.

```mermaid
flowchart LR
  G[Guest / Host / Owner browser]
  N[Netlify React application]
  A[Render Express API]
  D[(Neon PostgreSQL)]
  P[Paystack]
  C[Cloudinary]
  E[Brevo]

  G -->|HTTPS| N
  N -->|Bearer token + JSON| A
  A <-->|transactions, constraints, audit events| D
  A -->|initialize checkout| P
  P -->|signed webhook| A
  A -->|signed upload parameters| C
  A -->|verification and reset links| E
```

## Booking integrity

```mermaid
sequenceDiagram
  participant Guest
  participant Client as React client
  participant API as Express API
  participant DB as PostgreSQL
  participant Paystack

  Guest->>Client: Select dates and guest count
  Client->>API: Request availability
  API->>DB: Check active units and blackout ranges
  DB-->>API: Available units
  API-->>Client: Server-calculated options
  Guest->>Client: Create reservation
  Client->>API: Reservation + idempotency key
  API->>DB: Transaction + unit lock + range exclusion constraint
  DB-->>API: 15-minute HOLD or availability conflict
  API-->>Client: Hold reference
  Client->>API: Start checkout
  API->>Paystack: Server-calculated amount in kobo
  Paystack-->>API: Signed charge-success webhook
  API->>DB: Idempotent payment event + CONFIRMED reservation
  API-->>Client: Guest dashboard reflects confirmed stay
```

## Engineering guarantees

| Concern | Current control |
| --- | --- |
| Two guests try the same unit/dates | PostgreSQL range exclusion constraint and transactional locks |
| Browser retries booking/payment | Idempotency keys for reservations and payment checkout |
| Browser claims payment succeeded | Signed Paystack webhook is authoritative |
| Host changes public inventory | Listing returns to owner review before new discovery |
| Host attempts invalid stay action | Reservation state machine and Africa/Lagos date guards |
| Guest accesses another guest’s data | Bearer identity is derived server-side; guest routes filter by authenticated user |
| Support investigates a failure | `X-Request-Id` appears in response headers/errors and structured logs |

## Deployment responsibilities

- **Netlify:** Vite frontend and SPA fallback.
- **Render:** API process, protected environment variables, and health checks.
- **Neon:** relational source of truth, migrations, constraints, and audit records.
- **Paystack:** payment interface only; the webhook is the confirmation source.
- **Cloudinary:** property-image storage; only signed upload credentials reach approved hosts.
- **Brevo:** transactional delivery after domain authentication and account approval.

See [PROJECT_STATUS.md](../PROJECT_STATUS.md) for the current launch gate and externally dependent tasks.
