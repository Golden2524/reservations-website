export const roles = ['GUEST', 'HOST', 'ADMIN'] as const;
export type Role = (typeof roles)[number];
