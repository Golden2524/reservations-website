import { Router } from 'express';
import { requireAuth } from '../../auth/require-auth.js';
import { createDatabaseClient } from '../../db/client.js';
import { asyncRoute } from '../../http/async-route.js';

export const walletRouter = Router();
walletRouter.use(requireAuth);

walletRouter.get('/me', asyncRoute(async (request, response) => {
  const client = createDatabaseClient();
  await client.connect();
  try {
    await client.query(
      `INSERT INTO wallet_accounts (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING`,
      [request.auth!.userId],
    );
    const account = await client.query(
      `SELECT id, cash_balance_naira, credits_balance_naira, cash_enabled_at, created_at
       FROM wallet_accounts WHERE user_id = $1`,
      [request.auth!.userId],
    );
    const entries = await client.query(
      `SELECT balance_type, entry_type, amount_naira, reason, created_at
       FROM wallet_ledger_entries
       WHERE wallet_account_id = $1
       ORDER BY created_at DESC LIMIT 8`,
      [account.rows[0].id],
    );
    response.json({ data: { ...account.rows[0], cashWalletStatus: 'LOCKED_PENDING_PROVIDER', entries: entries.rows } });
  } finally { await client.end(); }
}));
