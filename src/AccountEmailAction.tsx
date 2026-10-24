import { FormEvent, useEffect, useState } from 'react'
import { Check, LoaderCircle, ShieldCheck, X } from 'lucide-react'
import { ApiRequestError, apiRequest } from './api'

type Action = { type: 'verify'; token: string } | { type: 'reset'; token: string }

export const getAccountEmailAction = (): Action | null => {
  const query = new URLSearchParams(window.location.search)
  const verify = query.get('verifyEmail')
  const reset = query.get('resetPassword')
  return verify ? { type: 'verify', token: verify } : reset ? { type: 'reset', token: reset } : null
}

export default function AccountEmailAction({ action, onClose }: { action: Action; onClose: () => void }) {
  const [state, setState] = useState<'working' | 'ready' | 'done' | 'error'>(action.type === 'verify' ? 'working' : 'ready')
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (action.type !== 'verify') return
    apiRequest<{ data: { message: string } }>('/auth/verify-email', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: action.token }) })
      .then((result) => { setMessage(result.data.message); setState('done') })
      .catch((error) => { setMessage(error instanceof ApiRequestError ? error.message : 'We could not verify that email right now.'); setState('error') })
  }, [action])

  async function resetPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const password = String(form.get('password') ?? '')
    if (password !== String(form.get('confirmation') ?? '')) { setMessage('The passwords do not match.'); setState('error'); return }
    setState('working'); setMessage('')
    try {
      const result = await apiRequest<{ data: { message: string } }>('/auth/reset-password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: action.token, password }) })
      setMessage(result.data.message); setState('done')
    } catch (error) { setMessage(error instanceof ApiRequestError ? error.message : 'We could not reset that password right now.'); setState('error') }
  }

  return <div className="account-backdrop"><section className="account-dialog email-action" aria-label="Account email action">
    <button className="account-close" onClick={onClose} aria-label="Close"><X size={18}/></button>
    <span className="email-action-icon"><ShieldCheck size={25}/></span><p className="kicker">ACCOUNT SECURITY</p><h2>{action.type === 'verify' ? 'Verifying your email.' : 'Choose a new password.'}</h2>
    {action.type === 'verify' && <p className="account-copy">{state === 'working' ? 'Please wait while we validate your secure link.' : message}</p>}
    {action.type === 'reset' && state !== 'done' && <form onSubmit={resetPassword}><p className="account-copy">Use at least 12 characters including uppercase, lowercase, and a number.</p><label>New password<input name="password" type="password" required minLength={12} autoComplete="new-password" /></label><label>Confirm new password<input name="confirmation" type="password" required minLength={12} autoComplete="new-password" /></label>{message && <p className="account-error" role="alert">{message}</p>}<button className="account-submit" disabled={state === 'working'}>{state === 'working' && <LoaderCircle size={16} className="spin"/>}Reset password</button></form>}
    {state === 'working' && action.type === 'verify' && <LoaderCircle className="spin email-action-loader" size={22}/>} {state === 'done' && <><p className="email-action-success"><Check size={16}/>{message}</p><button className="account-submit" onClick={onClose}>Continue to ReserveFlow</button></>} {state === 'error' && action.type === 'verify' && <><p className="account-error" role="alert">{message}</p><button className="account-submit" onClick={onClose}>Back to ReserveFlow</button></>}
  </section></div>
}
