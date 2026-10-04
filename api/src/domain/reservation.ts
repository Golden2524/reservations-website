export const reservationStatuses = [
  'HOLD',
  'PENDING_PAYMENT',
  'CONFIRMED',
  'CHECKED_IN',
  'COMPLETED',
  'CANCELLED',
  'EXPIRED',
] as const;

export type ReservationStatus = (typeof reservationStatuses)[number];

const transitions: Record<ReservationStatus, readonly ReservationStatus[]> = {
  HOLD: ['PENDING_PAYMENT', 'CANCELLED', 'EXPIRED'],
  PENDING_PAYMENT: ['CONFIRMED', 'CANCELLED', 'EXPIRED'],
  CONFIRMED: ['CHECKED_IN', 'CANCELLED'],
  CHECKED_IN: ['COMPLETED'],
  COMPLETED: [],
  CANCELLED: [],
  EXPIRED: [],
};

export const canTransitionReservation = (
  from: ReservationStatus,
  to: ReservationStatus,
): boolean => transitions[from].includes(to);

export const assertReservationTransition = (
  from: ReservationStatus,
  to: ReservationStatus,
): void => {
  if (!canTransitionReservation(from, to)) {
    throw new Error(`Invalid reservation transition: ${from} → ${to}`);
  }
};
