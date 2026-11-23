import { FormEvent, useEffect, useState } from 'react'
import { CalendarDays, Clock3, History, LoaderCircle, LogOut, RefreshCw, ShieldCheck, WalletCards, X, XCircle } from 'lucide-react'
import { ApiRequestError, apiRequest, getMyWallet, getReservationTimeline, type ReservationTimelineEvent, type Wallet } from './api'

type Account = { accessToken: string }
type Reservation = { id: string; public_reference: string; check_in: string; check_out: string; guest_count: number; status: string; total_naira: number; payment_expires_at: string | null; property_name: string; unit_name: string; area: string; city: string; has_review: boolean }
type Timeline = { reference: string; events: ReservationTimelineEvent[] }

const label = (value: string) => value.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (character) => character.toUpperCase())
const date = (value: string) => new Intl.DateTimeFormat('en-NG', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value.includes('T') ? value : `${value}T00:00:00`))
const eventLabel = (event: ReservationTimelineEvent) => ({ RESERVATION_HOLD_CREATED: 'Dates held for checkout', PAYMENT_CHECKOUT_STARTED: 'Secure payment checkout started', PAYMENT_CONFIRMED: 'Payment verified and reservation confirmed', PAYSTACK_CHARGE_SUCCESS: 'Payment provider confirmed the charge', GUEST_CHECKED_IN_BY_HOST: 'Host checked you in', STAY_COMPLETED_BY_HOST: 'Stay completed', RESERVATION_CANCELLED_BY_GUEST: 'Reservation cancelled', PROPERTY_REVIEW_SUBMITTED: 'Verified guest review submitted' }[event.event_type] ?? label(event.event_type))
const statusGuidance = (status: string) => ({ HOLD: 'Your dates are temporarily held. Complete checkout before the payment window closes.', PENDING_PAYMENT: 'Payment is still being verified. Do not treat this stay as confirmed until the status changes.', CONFIRMED: 'Your stay is confirmed. Keep this reference and contact the host only through ReserveFlow support if you need help.', CHECKED_IN: 'You are checked in. Your host will complete the stay after departure.', COMPLETED: 'Your stay is complete. You can now leave a verified review.', CANCELLED: 'This reservation was cancelled and the dates were released.', EXPIRED: 'The payment hold expired before a booking could be confirmed. You can search again for available dates.' }[status] ?? 'We are updating this reservation. Refresh in a moment for the latest status.')

export default function GuestReservationsPanel({ account, onClose, onSignOut }: { account: Account; onClose: () => void; onSignOut: () => void }) {
  const [reservations, setReservations] = useState<Reservation[]>([])
  const [wallet, setWallet] = useState<Wallet | null>(null)
  const [timeline, setTimeline] = useState<Timeline | null>(null)
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState('')
  const [error, setError] = useState('')
  const [reviewingId, setReviewingId] = useState('')

  const load = async () => {
    setLoading(true); setError('')
    try {
      const [reservationsResult, walletResult] = await Promise.all([
        apiRequest<{ data: Reservation[] }>('/reservations/mine', { headers: { Authorization: `Bearer ${account.accessToken}` } }),
        getMyWallet(account.accessToken),
      ])
      setReservations(reservationsResult.data); setWallet(walletResult.data)
    } catch (cause) { setError(cause instanceof ApiRequestError ? cause.message : 'Unable to load your reservations.') } finally { setLoading(false) }
  }
  useEffect(() => { void load() }, [])

  const viewTimeline = async (reservation: Reservation) => {
    setBusyId(`timeline-${reservation.id}`); setError('')
    try { const result = await getReservationTimeline(account.accessToken, reservation.id); setTimeline({ reference: result.data.publicReference, events: result.data.events }) }
    catch (cause) { setError(cause instanceof ApiRequestError ? cause.message : 'We could not load this booking timeline.') } finally { setBusyId('') }
  }
  const cancel = async (reservation: Reservation) => {
    const reason = window.prompt(`Cancel ${reservation.property_name}? This releases the dates. Refunds, if applicable, are reviewed separately.`)
    if (!reason || reason.trim().length < 3) return
    setBusyId(reservation.id); setError('')
    try {
      const result = await apiRequest<{ data: { status: string } }>(`/reservations/${reservation.id}/cancel`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${account.accessToken}` }, body: JSON.stringify({ reason: reason.trim() }) })
      setReservations((items) => items.map((item) => item.id === reservation.id ? { ...item, status: result.data.status } : item))
    } catch (cause) { setError(cause instanceof ApiRequestError ? cause.message : 'We could not cancel this reservation.') } finally { setBusyId('') }
  }
  const submitReview = async (event: FormEvent<HTMLFormElement>, reservation: Reservation) => {
    event.preventDefault(); const form = new FormData(event.currentTarget); setBusyId(`review-${reservation.id}`); setError('')
    try {
      await apiRequest(`/reservations/${reservation.id}/review`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${account.accessToken}` }, body: JSON.stringify({ rating: Number(form.get('rating')), comment: String(form.get('comment')).trim() }) })
      setReservations((items) => items.map((item) => item.id === reservation.id ? { ...item, has_review: true } : item)); setReviewingId('')
    } catch (cause) { setError(cause instanceof ApiRequestError ? cause.message : 'We could not publish your review.') } finally { setBusyId('') }
  }

  return <div className="my-reservations-backdrop" onMouseDown={onClose}><section className="my-reservations" onMouseDown={(event) => event.stopPropagation()} aria-label="Your ReserveFlow reservations">
    <button className="reservations-close" onClick={onClose} aria-label="Close reservations"><X size={18}/></button><header><p className="kicker">GUEST ACCOUNT</p><h2>Your reservations.</h2><p>Live status from the ReserveFlow booking service.</p></header>
    <div className="reservation-tools"><button className="reservations-refresh" onClick={() => void load()} disabled={loading}><RefreshCw size={15} className={loading ? 'spin' : ''}/> Refresh</button></div>
    {error && <p className="reservations-error">{error}</p>}
    {loading ? <div className="reservations-loading"><LoaderCircle className="spin"/> Loading live reservations…</div> : <><section className="wallet-card"><div><span><WalletCards size={17}/></span><p className="kicker">YOUR RESERVEFLOW WALLET</p><h3>₦{Number(wallet?.credits_balance_naira ?? 0).toLocaleString()} <small>booking credits</small></h3><p>Owner-issued credits can securely confirm a booking when they cover the full checkout total.</p></div><aside><b>Cash wallet</b><strong>₦{Number(wallet?.cash_balance_naira ?? 0).toLocaleString()}</strong><small>Locked pending licensed provider connection and verification.</small></aside></section>
      {wallet?.entries?.length ? <div className="wallet-history">{wallet.entries.map((entry) => <p key={`${entry.created_at}-${entry.reason}`}><span>{entry.entry_type.replaceAll('_', ' ').toLowerCase()}</span><b>{entry.amount_naira > 0 ? '+' : ''}₦{Number(entry.amount_naira).toLocaleString()}</b></p>)}</div> : null}<div className="live-reservation-list">{reservations.map((reservation) => { const cancellable = ['HOLD', 'PENDING_PAYMENT', 'CONFIRMED'].includes(reservation.status); const reviewable = reservation.status === 'COMPLETED' && !reservation.has_review; const expiry = reservation.payment_expires_at ? new Date(reservation.payment_expires_at) : null; return <article key={reservation.id}><div><span className={`live-status ${reservation.status.toLowerCase()}`}>{label(reservation.status)}</span><small>{reservation.public_reference}</small></div><h3>{reservation.property_name}</h3><p>{reservation.unit_name} · {reservation.area}, {reservation.city}</p><dl><div><dt><CalendarDays size={14}/> Stay</dt><dd>{date(reservation.check_in)} — {date(reservation.check_out)}</dd></div><div><dt><Clock3 size={14}/> Guests</dt><dd>{reservation.guest_count} guest{reservation.guest_count === 1 ? '' : 's'}</dd></div><div><dt><ShieldCheck size={14}/> Total</dt><dd>₦{Number(reservation.total_naira).toLocaleString()}</dd></div></dl><p className={`reservation-status-guidance ${reservation.status.toLowerCase()}`}>{statusGuidance(reservation.status)}</p>{expiry && !Number.isNaN(expiry.getTime()) && <small className="payment-window">Complete payment before {expiry.toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' })} to keep this hold.</small>}<button className="reservation-timeline-button" disabled={busyId === `timeline-${reservation.id}`} onClick={() => void viewTimeline(reservation)}>{busyId === `timeline-${reservation.id}` ? <LoaderCircle className="spin" size={14}/> : <History size={14}/>} View booking timeline</button>{cancellable && <div className="reservation-cancellation"><span>Cancellation releases these dates.</span><button disabled={busyId === reservation.id} onClick={() => void cancel(reservation)}><XCircle size={14}/> Cancel reservation</button></div>}{reviewable && <div className="reservation-review">{reviewingId === reservation.id ? <form onSubmit={(event) => void submitReview(event, reservation)}><strong>Share your verified stay</strong><select name="rating" defaultValue="5"><option value="5">5 stars — excellent</option><option value="4">4 stars — very good</option><option value="3">3 stars — good</option><option value="2">2 stars — fair</option><option value="1">1 star — poor</option></select><textarea name="comment" minLength={10} maxLength={1200} required placeholder="What would help future guests?"/><div><button type="button" onClick={() => setReviewingId('')}>Not now</button><button disabled={busyId === `review-${reservation.id}`}>Publish review</button></div></form> : <button onClick={() => setReviewingId(reservation.id)}>Leave a verified review</button>}</div>}</article> })}</div>
      {!reservations.length && <div className="reservations-empty"><CalendarDays size={26}/><h3>No reservations yet.</h3><p>When you complete a booking, its live status will appear here.</p></div>}</>}
    {timeline && <section className="reservation-timeline"><button onClick={() => setTimeline(null)} aria-label="Close booking timeline"><X size={16}/></button><p className="kicker">BOOKING TIMELINE</p><h3>{timeline.reference}</h3>{timeline.events.length ? <ol>{timeline.events.map((event) => <li key={event.id}><strong>{eventLabel(event)}</strong><span>{new Date(event.created_at).toLocaleString('en-NG')}</span></li>)}</ol> : <p>No timeline events have been recorded yet.</p>}</section>}
    <footer className="reservations-footer"><button className="reservations-signout" onClick={onSignOut}><LogOut size={15}/> Sign out of this account</button></footer>
  </section></div>
}
