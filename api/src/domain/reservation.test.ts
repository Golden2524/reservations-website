import { assertReservationTransition, canTransitionReservation } from './reservation.js';

const assertions: Array<[boolean, string]> = [
  [canTransitionReservation('HOLD', 'PENDING_PAYMENT'), 'hold can proceed to payment'],
  [canTransitionReservation('PENDING_PAYMENT', 'CONFIRMED'), 'payment can confirm a booking'],
  [canTransitionReservation('CONFIRMED', 'CHECKED_IN'), 'confirmed booking can check in'],
  [!canTransitionReservation('CANCELLED', 'CONFIRMED'), 'cancelled booking cannot be revived'],
];

for (const [passed, message] of assertions) {
  if (!passed) throw new Error(`Reservation state machine failed: ${message}`);
}

assertReservationTransition('CHECKED_IN', 'COMPLETED');
