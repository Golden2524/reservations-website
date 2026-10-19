import { useEffect, useState } from 'react'
import { CalendarDays, Clock3, LoaderCircle, MapPin, RefreshCw, ShieldCheck, X } from 'lucide-react'
import { ApiRequestError, apiRequest } from './api'

type Account = { accessToken: string; user: { firstName: string } }
type Reservation = { id: string; public_reference: string; check_in: string; check_out: string; guest_count: number; status: string; total_naira: number; hold_expires_at: string | null; payment_expires_at: string | null; property_name: string; unit_name: string; area: string; city: string }

const label = (value: string) => value.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (character) => character.toUpperCase())
const date = (value: string) => new Intl.DateTimeFormat('en-NG', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(`${value}T00:00:00`))

export default function MyReservations({ account, onClose }: { account: Account; onClose: () => void }) {
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
  return <div className="my-reservations-backdrop" onMouseDown={onClose}><section className="my-reservations" onMouseDown={(event) => event.stopPropagation()}><button className="reservations-close" onClick={onClose} aria-label="Close reservations"><X size={18}/></button><header><p className="kicker">GUEST ACCOUNT</p><h2>Your reservations.</h2><p>Live status from the ReserveFlow booking service.</p></header><button className="reservations-refresh" onClick={() => void load()} disabled={loading}><RefreshCw size={15} className={loading ? 'spin' : ''}/> Refresh</button>{loading ? <div className="reservations-loading"><LoaderCircle className="spin"/> Loading live reservations…</div> : error ? <p className="reservations-error">{error}</p> : reservations.length === 0 ? <div className="reservations-empty"><CalendarDays size={26}/><h3>No reservations yet.</h3><p>When you complete a booking, its live status will appear here.</p></div> : <div className="live-reservation-list">{reservations.map((reservation) => <article key={reservation.id}><div><span className={`live-status ${reservation.status.toLowerCase()}`}>{label(reservation.status)}</span><small>{reservation.public_reference}</small></div><h3>{reservation.property_name}</h3><p>{reservation.unit_name} · {reservation.area}, {reservation.city}</p><dl><div><dt><CalendarDays size={14}/> Stay</dt><dd>{date(reservation.check_in)} — {date(reservation.check_out)}</dd></div><div><dt><Clock3 size={14}/> Guests</dt><dd>{reservation.guest_count} guest{reservation.guest_count > 1 ? 's' : ''}</dd></div><div><dt><ShieldCheck size={14}/> Total</dt><dd>₦{reservation.total_naira.toLocaleString()}</dd></div></dl>{reservation.payment_expires_at && <small className="payment-window">Complete payment before {new Date(reservation.payment_expires_at).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' })} to keep this hold.</small>}</article>)}</div>}</section></div>
}
