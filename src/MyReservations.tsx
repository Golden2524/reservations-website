import { useEffect, useState } from 'react'
import { CalendarDays, Clock3, LoaderCircle, RefreshCw, ShieldCheck, LogOut, X } from 'lucide-react'
import { ApiRequestError, apiRequest } from './api'

type Account = { accessToken: string; user: { firstName: string } }
type Reservation = { id: string; public_reference: string; check_in: string; check_out: string; guest_count: number; status: string; total_naira: number; hold_expires_at: string | null; payment_expires_at: string | null; property_name: string; unit_name: string; area: string; city: string }

const label = (value: string) => value.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (character) => character.toUpperCase())
const date = (value?: string | null) => {
  if (!value) return 'Dates pending'
  const normalized = value.includes('T') ? value : `${value}T00:00:00`
  const parsed = new Date(normalized)
  return Number.isNaN(parsed.getTime()) ? 'Dates pending' : new Intl.DateTimeFormat('en-NG', { day: 'numeric', month: 'short', year: 'numeric' }).format(parsed)
}

export default function MyReservations({ account, onClose, onSignOut }: { account: Account; onClose: () => void; onSignOut: () => void }) {
  const [reservations, setReservations] = useState<Reservation[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const load = async () => {
    setLoading(true); setError('')
    try {
      const result = await apiRequest<{ data: Reservation[] }>('/reservations/mine', { headers: { Authorization: `Bearer ${account.accessToken}` } })
      setReservations(result.data)
    } catch (cause) { setError(cause instanceof ApiRequestError ? cause.message : 'Unable to load your reservations.') } finally { setLoading(false) }
  }
  useEffect(() => { void load() }, [])
  return <div className="my-reservations-backdrop" onMouseDown={onClose}><section className="my-reservations" onMouseDown={(event) => event.stopPropagation()}><button className="reservations-close" onClick={onClose} aria-label="Close reservations"><X size={18}/></button><header><p className="kicker">GUEST ACCOUNT</p><h2>Your reservations.</h2><p>Live status from the ReserveFlow booking service.</p></header><div className="reservation-tools"><button className="reservations-refresh" onClick={() => void load()} disabled={loading}><RefreshCw size={15} className={loading ? 'spin' : ''}/> Refresh</button></div>{loading ? <div className="reservations-loading"><LoaderCircle className="spin"/> Loading live reservations…</div> : error ? <p className="reservations-error">{error}</p> : reservations.length === 0 ? <div className="reservations-empty"><CalendarDays size={26}/><h3>No reservations yet.</h3><p>When you complete a booking, its live status will appear here.</p></div> : <div className="live-reservation-list">{reservations.map((reservation) => { const status = typeof reservation.status === 'string' ? reservation.status : 'UNKNOWN'; const total = Number(reservation.total_naira) || 0; const expiry = reservation.payment_expires_at ? new Date(reservation.payment_expires_at) : null; return <article key={reservation.id}><div><span className={`live-status ${status.toLowerCase()}`}>{label(status)}</span><small>{reservation.public_reference ?? 'Reservation'}</small></div><h3>{reservation.property_name ?? 'ReserveFlow stay'}</h3><p>{reservation.unit_name ?? 'Accommodation'} · {reservation.area ?? 'Kuje'}, {reservation.city ?? 'Abuja'}</p><dl><div><dt><CalendarDays size={14}/> Stay</dt><dd>{reservation.check_in ? `${date(reservation.check_in)} — ${date(reservation.check_out)}` : 'Dates pending'}</dd></div><div><dt><Clock3 size={14}/> Guests</dt><dd>{reservation.guest_count ?? 1} guest{reservation.guest_count > 1 ? 's' : ''}</dd></div><div><dt><ShieldCheck size={14}/> Total</dt><dd>₦{total.toLocaleString()}</dd></div></dl>{expiry && !Number.isNaN(expiry.getTime()) && <small className="payment-window">Complete payment before {expiry.toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' })} to keep this hold.</small>}</article>})}</div>}<footer className="reservations-footer"><button className="reservations-signout" onClick={onSignOut}><LogOut size={15}/> Sign out of this account</button></footer></section></div>
}
