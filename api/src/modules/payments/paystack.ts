import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '../../config/env.js';
import { ApiError } from '../../errors/api-error.js';

const paystackBaseUrl = 'https://api.paystack.co';

type InitializePayment = {
  email: string;
  amountKobo: number;
  reference: string;
  metadata: Record<string, string>;
};

export type PaystackEvent = {
  event: string;
  data: {
    reference?: string;
    status?: string;
  };
};

const secretKey = (): string => {
  if (!env.PAYSTACK_SECRET_KEY) {
    throw new ApiError(503, 'Payments are not configured yet.', 'PAYMENTS_NOT_CONFIGURED');
  }
  return env.PAYSTACK_SECRET_KEY;
};

export const assertPaystackConfigured = (): void => {
  secretKey();
};

export const initializePaystackTransaction = async (input: InitializePayment): Promise<{
  authorizationUrl: string;
  accessCode: string;
  reference: string;
}> => {
  const response = await fetch(`${paystackBaseUrl}/transaction/initialize`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${secretKey()}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      email: input.email,
      amount: String(input.amountKobo),
      currency: 'NGN',
      reference: input.reference,
      callback_url: env.PAYSTACK_CALLBACK_URL,
      metadata: JSON.stringify(input.metadata),
      channels: ['card', 'bank', 'ussd', 'bank_transfer'],
    }),
  });

  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok || !payload || typeof payload !== 'object' || !('data' in payload)) {
    throw new ApiError(502, 'Payment provider could not initialize checkout.', 'PAYMENT_INITIALIZATION_FAILED');
  }
  const data = (payload as { data: Record<string, unknown> }).data;
  if (
    typeof data.authorization_url !== 'string'
    || typeof data.access_code !== 'string'
    || typeof data.reference !== 'string'
  ) {
    throw new ApiError(502, 'Payment provider returned an invalid checkout response.', 'PAYMENT_INITIALIZATION_FAILED');
  }
  return { authorizationUrl: data.authorization_url, accessCode: data.access_code, reference: data.reference };
};

export const verifyPaystackSignature = (rawBody: Buffer, signature: string | undefined): boolean => {
  if (!signature || !env.PAYSTACK_SECRET_KEY) return false;
  const expected = createHmac('sha512', env.PAYSTACK_SECRET_KEY).update(rawBody).digest('hex');
  const received = Buffer.from(signature, 'utf8');
  const computed = Buffer.from(expected, 'utf8');
  return received.length === computed.length && timingSafeEqual(received, computed);
};
