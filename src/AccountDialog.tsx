import { FormEvent, useState } from 'react'
import { Check, LoaderCircle, X } from 'lucide-react'
import { ApiRequestError, apiRequest } from './api'

type Account = { accessToken: string; user: { firstName: string; lastName: string; email: string; role: string } }
type AuthResponse = { data: Account }

export default function AccountDialog({ onClose, onAuthenticated, initialMode = 'register' }: { onClose: () => void; onAuthenticated: (account: Account) => void; initialMode?: 'login' | 'register' }) {
  const [mode, setMode] = useState<'login' | 'register'>(initialMode)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true); setMessage('')
    const form = new FormData(event.currentTarget)
    const body = mode === 'register'
      ? { email: form.get('email'), firstName: form.get('firstName'), lastName: form.get('lastName'), password: form.get('password') }
      : { email: form.get('email'), password: form.get('password') }
    try {
      const result = await apiRequest<AuthResponse>(`/auth/${mode === 'register' ? 'register' : 'login'}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      sessionStorage.setItem('reserveflow.account', JSON.stringify(result.data))
      onAuthenticated(result.data)
    } catch (error) {
      setMessage(error instanceof ApiRequestError ? error.message : 'We could not complete that request. Please try again.')
    } finally { setBusy(false) }
  }

  return <div className="account-backdrop" onMouseDown={onClose}><section className="account-dialog" onMouseDown={(event) => event.stopPropagation()} aria-label="Account access">
    <button className="account-close" onClick={onClose} aria-label="Close account dialog"><X size={18}/></button>
    <p className="kicker">{mode === 'register' ? 'WELCOME TO RESERVEFLOW' : 'WELCOME BACK'}</p>
    <h2>{mode === 'register' ? 'Book with confidence.' : 'Continue your journey.'}</h2>
    <p className="account-copy">{mode === 'register' ? 'Create a guest account to hold availability and securely pay for a stay.' : 'Sign in to see your reservations and complete your booking.'}</p>
    <form onSubmit={submit}>
      {mode === 'register' && <div className="account-row"><label>First name<input name="firstName" required autoComplete="given-name" /></label><label>Last name<input name="lastName" required autoComplete="family-name" /></label></div>}
      <label>Email address<input name="email" type="email" required autoComplete="email" /></label>
      <label>Password<input name="password" type="password" required minLength={mode === 'register' ? 12 : 1} autoComplete={mode === 'register' ? 'new-password' : 'current-password'} /></label>
      {mode === 'register' && <small className="password-hint"><Check size={13}/> At least 12 characters, with uppercase, lowercase, and a number.</small>}
      {message && <p className="account-error" role="alert">{message}</p>}
      <button className="account-submit" disabled={busy}>{busy && <LoaderCircle size={16} className="spin"/>}{mode === 'register' ? 'Create guest account' : 'Sign in'}</button>
    </form>
    <p className="account-switch">{mode === 'register' ? 'Already have an account?' : 'New to ReserveFlow?'} <button onClick={() => { setMode(mode === 'register' ? 'login' : 'register'); setMessage('') }}>{mode === 'register' ? 'Sign in' : 'Create an account'}</button></p>
  </section></div>
}
