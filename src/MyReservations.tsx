import { FormEvent, useEffect, useState } from 'react'
import { CalendarDays, Clock3, LoaderCircle, RefreshCw, ShieldCheck, LogOut, WalletCards, X, XCircle } from 'lucide-react'
import { ApiRequestError, apiRequest, getMyWallet, type Wallet } from './api'

type Account = { accessToken: string; user: { firstName: string } }
type Reservation = { id: string; public_reference: string; check_in: string; check_out: string; guest_count: number; status: string; total_naira: number; hold_expires_at: string | null; payment_expires_at: string | null; property_name: string; unit_name: string; area: string; city: string; has_review: boolean }

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
  const [cancellingId, setCancellingId] = useState('')
  const [reviewingId, setReviewingId] = useState('')
  const [reviewRating, setReviewRating] = useState('5')
  const [reviewComment, setReviewComment] = useState('')
  const [reviewBusy, setReviewBusy] = useState(false)
  const [wallet, setWallet] = useState<Wallet | null>(null)
  const load = async () => {
    setLoading(true); setError('')
    try {
      const [result, walletResult] = await Promise.all([apiRequest<{ data: Reservation[] }>('/reservations/mine', { headers: { Authorization: `Bearer ${account.accessToken}` } }), getMyWallet(account.accessToken)])
      setReservations(result.data); setWallet(walletResult.data)
    } catch (cause) { setError(cause instanceof ApiRequestError ? cause.message : 'Unable to load your reservations.') } finally { setLoading(false) }
  }
  const cancelReservation = async (reservation: Reservation) => {
    const reason = window.prompt(`Cancel ${reservation.property_name}? This releases the accommodation dates. Refunds, if applicable, are reviewed separately. Please tell us why you are cancelling.`)
    if (reason === null) return
    if (reason.trim().length < 3) { setError('Please enter a short cancellation reason of at least three characters.'); return }
    setCancellingId(reservation.id); setError('')
    try {
      const result = await apiRequest<{ data: { status: string; cancelled_at: string; cancellation_reason: string } }>(`/reservations/${reservation.id}/cancel`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${account.accessToken}` }, body: JSON.stringify({ reason: reason.trim() }) })
      setReservations((items) => items.map((item) => item.id === reservation.id ? { ...item, status: result.data.status } : item))
    } catch (cause) { setError(cause instanceof ApiRequestError ? cause.message : 'We could not cancel this reservation.') } finally { setCancellingId('') }
  }
  const submitReview = async (event: FormEvent<HTMLFormElement>, reservation: Reservation) => {
    event.preventDefault()
    setReviewBusy(true); setError('')
    try {
      await apiRequest(`/reservations/${reservation.id}/review`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${account.accessToken}` }, body: JSON.stringify({ rating: Number(reviewRating), comment: reviewComment.trim() }) })
      setReservations((items) => items.map((item) => item.id === reservation.id ? { ...item, has_review: true } : item))
      setReviewingId(''); setReviewComment('')
    } catch (cause) { setError(cause instanceof ApiRequestError ? cause.message : 'We could not publish your review.') } finally { setReviewBusy(false) }
  }
  useEffect(() => { void load() }, [])
  return <div className="my-reservations-backdrop" onMouseDown={onClose}><section className="my-reservations" onMouseDown={(event) => event.stopPropagation()}><button className="reservations-close" onClick={onClose} aria-label="Close reservations"><X size={18}/></button><header><p className="kicker">GUEST ACCOUNT</p><h2>Your reservations.</h2><p>Live status from the ReserveFlow booking service.</p></header><div className="reservation-tools"><button className="reservations-refresh" onClick={() => void load()} disabled={loading}><RefreshCw size={15} className={loading ? 'spin' : ''}/> Refresh</button></div>{loading ? <div className="reservations-loading"><LoaderCircle className="spin"/> Loading live reservations…</div> : error ? <p className="reservations-error">{error}</p> : <><section className="wallet-card"><div><span><WalletCards size={17}/></span><p className="kicker">YOUR RESERVEFLOW WALLET</p><h3>₦{Number(wallet?.credits_balance_naira ?? 0).toLocaleString()} <small>booking credits</small></h3><p>Owner-issued credits can securely confirm a booking when they cover the full checkout total.</p></div><aside><b>Cash wallet</b><strong>₦{Number(wallet?.cash_balance_naira ?? 0).toLocaleString()}</strong><small>Locked pending licensed provider connection, verification, and funding controls.</small></aside>{wallet?.entries?.length ? <div className="wallet-history">{wallet.entries.map((entry) => <p key={`${entry.created_at}-${entry.reason}`}><span>{entry.entry_type.replaceAll('_', ' ').toLowerCase()}</span><b>{entry.amount_naira > 0 ? '+' : ''}₦{Number(entry.amount_naira).toLocaleString()}</b></p>)}</div> : null}</section>{reservations.length === 0 ? <div className="reservations-empty"><CalendarDays size={26}/><h3>No reservations yet.</h3><p>When you complete a booking, its live status will appear here.</p></div> : <div className="live-reservation-list">{reservations.map((reservation) => { const status = typeof reservation.status === 'string' ? reservation.status : 'UNKNOWN'; const total = Number(reservation.total_naira) || 0; const expiry = reservation.payment_expires_at ? new Date(reservation.payment_expires_at) : null; const cancellable = ['HOLD', 'PENDING_PAYMENT', 'CONFIRMED'].includes(status); const reviewable = status === 'COMPLETED' && !reservation.has_review; return <article key={reservation.id}><div><span className={`live-status ${status.toLowerCase()}`}>{label(status)}</span><small>{reservation.public_reference ?? 'Reservation'}</small></div><h3>{reservation.property_name ?? 'ReserveFlow stay'}</h3><p>{reservation.unit_name ?? 'Accommodation'} · {reservation.area ?? 'Kuje'}, {reservation.city ?? 'Abuja'}</p><dl><div><dt><CalendarDays size={14}/> Stay</dt><dd>{reservation.check_in ? `${date(reservation.check_in)} — ${date(reservation.check_out)}` : 'Dates pending'}</dd></div><div><dt><Clock3 size={14}/> Guests</dt><dd>{reservation.guest_count ?? 1} guest{reservation.guest_count > 1 ? 's' : ''}</dd></div><div><dt><ShieldCheck size={14}/> Total</dt><dd>₦{total.toLocaleString()}</dd></div></dl>{expiry && !Number.isNaN(expiry.getTime()) && <small className="payment-window">Complete payment before {expiry.toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' })} to keep this hold.</small>}{cancellable && <div className="reservation-cancellation"><span>Cancellation releases these dates. Any paid refund is reviewed under the final policy.</span><button onClick={() => void cancelReservation(reservation)} disabled={cancellingId === reservation.id}>{cancellingId === reservation.id ? <LoaderCircle className="spin" size={14}/> : <XCircle size={14}/>} Cancel reservation</button></div>}{reviewable && <div className="reservation-review">{reviewingId === reservation.id ? <form onSubmit={(event) => void submitReview(event, reservation)}><strong>Share your verified stay</strong><select value={reviewRating} onChange={(event) => setReviewRating(event.target.value)} aria-label="Rating"><option value="5">5 stars — excellent</option><option value="4">4 stars — very good</option><option value="3">3 stars — good</option><option value="2">2 stars — fair</option><option value="1">1 star — poor</option></select><textarea value={reviewComment} onChange={(event) => setReviewComment(event.target.value)} minLength={10} maxLength={1200} required placeholder="What would help future guests?"/><div><button type="button" onClick={() => setReviewingId('')}>Not now</button><button disabled={reviewBusy}>{reviewBusy && <LoaderCircle className="spin" size={14}/>} Publish review</button></div></form> : <button onClick={() => setReviewingId(reservation.id)}>Leave a verified review</button>}</div>}</article>})}</div>}</>}<footer className="reservations-footer"><button className="reservations-signout" onClick={onSignOut}><LogOut size={15}/> Sign out of this account</button></footer></section></div>
}
