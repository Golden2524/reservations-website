import { createHash, randomBytes } from 'node:crypto';
import type { Client } from 'pg';
import { env } from '../../config/env.js';
import { createDatabaseClient } from '../../db/client.js';

type ActionPurpose = 'EMAIL_VERIFICATION' | 'PASSWORD_RESET';
const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');
const configured = () => Boolean(env.BREVO_API_KEY && env.BREVO_SENDER_EMAIL && env.BREVO_SENDER_NAME && env.APP_URL);
const escapeHtml = (value: string) => value.replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]!));

async function sendEmail(to: string, subject: string, htmlContent: string) {
  if (!configured()) { console.warn('Transactional email skipped: Brevo or APP_URL is not configured.'); return false; }
  try {
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': env.BREVO_API_KEY!, 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ sender: { email: env.BREVO_SENDER_EMAIL!, name: env.BREVO_SENDER_NAME! }, to: [{ email: to }], subject, htmlContent }),
    });
    if (!response.ok) { console.error({ status: response.status, detail: await response.text() }, 'Brevo transactional email failed'); return false; }
    return true;
  } catch (error) { console.error({ error }, 'Brevo transactional email request failed'); return false; }
}

async function issue(userId: string, purpose: ActionPurpose) {
  const token = randomBytes(32).toString('base64url');
  const client = createDatabaseClient(); await client.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM account_action_tokens WHERE user_id = $1 AND purpose = $2 AND used_at IS NULL', [userId, purpose]);
    await client.query(`INSERT INTO account_action_tokens (user_id, purpose, token_hash, expires_at) VALUES ($1, $2, $3, now() + interval '30 minutes')`, [userId, purpose, tokenHash(token)]);
    await client.query('COMMIT'); return token;
  } catch (error) { await client.query('ROLLBACK'); throw error; } finally { await client.end(); }
}

const actionLink = (parameter: string, token: string) => `${env.APP_URL}?${parameter}=${encodeURIComponent(token)}`;

export async function sendVerificationEmail(user: { id: string; email: string; firstName: string }) {
  const token = await issue(user.id, 'EMAIL_VERIFICATION');
  return sendEmail(user.email, 'Verify your ReserveFlow email', `<p>Hi ${escapeHtml(user.firstName)},</p><p>Confirm your email to protect your ReserveFlow account.</p><p><a href="${actionLink('verifyEmail', token)}">Verify my email</a></p><p>This link expires in 30 minutes. If you did not create this account, ignore this email.</p>`);
}

export async function sendPasswordResetEmail(user: { id: string; email: string; firstName: string }) {
  const token = await issue(user.id, 'PASSWORD_RESET');
  return sendEmail(user.email, 'Reset your ReserveFlow password', `<p>Hi ${escapeHtml(user.firstName)},</p><p>We received a request to reset your ReserveFlow password.</p><p><a href="${actionLink('resetPassword', token)}">Reset my password</a></p><p>This link expires in 30 minutes. If you did not request it, ignore this email.</p>`);
}

export async function consumeActionToken(token: string, purpose: ActionPurpose, action: (userId: string, client: Client) => Promise<void>) {
  const client = createDatabaseClient(); await client.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query<{ user_id: string }>(`SELECT user_id FROM account_action_tokens WHERE token_hash = $1 AND purpose = $2 AND used_at IS NULL AND expires_at > now() FOR UPDATE`, [tokenHash(token), purpose]);
    const record = result.rows[0];
    if (!record) { await client.query('ROLLBACK'); return false; }
    await action(record.user_id, client);
    await client.query('UPDATE account_action_tokens SET used_at = now() WHERE token_hash = $1', [tokenHash(token)]);
    await client.query('COMMIT'); return true;
  } catch (error) { await client.query('ROLLBACK'); throw error; } finally { await client.end(); }
}
