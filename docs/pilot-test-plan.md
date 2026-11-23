# ReserveFlow closed-pilot test plan

Run this with a small set of verified Kuje hosts and guests before enabling live payments. Use **Paystack test mode** only. Record the browser, device, expected outcome, actual outcome, and any `X-Request-Id` from an API error.

## 1. Guest account and security

1. Register a new guest with a compliant password.
2. Confirm that a verification email is requested (delivery depends on the approved domain sender).
3. Request a password reset and confirm the account password is never included in the email.
4. Use **Resend verification email** and confirm it shows the same safe response for all addresses.
5. Sign out, sign back in, and confirm the guest can see only their own reservations.

## 2. Discovery and availability

1. Search by Kuje and by a different Nigerian city/area.
2. Confirm a property’s cover photo, gallery, pricing, guest capacity, and dates render correctly on a phone.
3. Hold a room for selected dates.
4. In a second browser/account, attempt the same unit and dates. It must be unavailable.
5. Cancel the first hold and confirm the dates become bookable again.
6. Let one hold expire, run the expiry job in the test environment, and confirm availability returns.

## 3. Payment and reservation lifecycle

1. Start a Paystack test checkout. Confirm the browser redirect alone does not mark a reservation paid.
2. Complete a successful test charge. Confirm the signed webhook changes the reservation to **Confirmed**.
3. Attempt a failed/declined test charge. Confirm there is no confirmed reservation.
4. Refresh the guest dashboard and confirm the timeline records the hold and payment activity.
5. Cancel an eligible booking and confirm the timeline records the cancellation.
6. Confirm a host cannot check in before arrival, or complete a stay before checkout.
7. On the allowed dates, check in and complete the stay. Submit one verified guest review.

## 4. Host supply and owner operations

1. Submit a host application from a guest account.
2. Approve it from the owner dashboard, then sign out/in to refresh the host role.
3. Add a property, unit, gallery, and availability block. Confirm it is private until owner approval.
4. Approve the listing and verify it appears in guest discovery with the selected cover photo.
5. Edit a live listing or add a unit. Confirm it returns to review before new bookings can find it.
6. Suspend and reactivate a listing from the owner dashboard. Verify the audit history records both actions.

## 5. Support and recovery

1. Submit a support request with a reservation reference.
2. Move it through **In progress** and **Resolved** in the owner workspace.
3. Deliberately submit an invalid API request in a controlled test and record the returned `X-Request-Id`.
4. Find that ID in the Render logs and confirm it identifies the request without leaking credentials or payment details.

## Exit criteria

The closed pilot passes only when every scenario above has an expected outcome, no unresolved security/booking-integrity issue remains, and operating staff can explain how to handle failed payments, expired holds, cancellations, and support escalation.

Do not switch to Paystack live keys or accept real bookings until the domain, legal, email, always-on API, scheduled expiry worker, monitoring, and backup requirements in [PROJECT_STATUS.md](../PROJECT_STATUS.md) are complete.
