import { useEffect, useMemo, useState } from 'react'
import { AlertCircle, ArrowLeft, ArrowRight, CalendarDays, Check, CreditCard, LoaderCircle, LockKeyhole, MapPin, Minus, Plus, ShieldCheck, Users, X } from 'lucide-react'
import type { Space } from './App'
import { ApiRequestError, apiRequest, getAvailability, getAvailabilityCalendar, type AvailabilityDate, type Unit } from './api'

type Account = { accessToken: string; user: { firstName: string; lastName: string; email: string; role: string } }
type Step = 'details' | 'review'
const dateValue = (offset: number) => { const day = new Date(); day.setDate(day.getDate() + offset); return day.toISOString().slice(0, 10) }
const addDays = (value: string, offset: number) => { const day = new Date(`${value}T00:00:00`); day.setDate(day.getDate() + offset); return day.toISOString().slice(0, 10) }
const changeMonth = (month: string, offset: number) => { const date = new Date(`${month}-01T00:00:00`); date.setMonth(date.getMonth() + offset); return date.toISOString().slice(0, 7) }

export default function Checkout({ space, initialGuests, account, onClose, onRequireAccount }: { space: Space; initialGuests: number; account: Account | null; onClose: () => void; onRequireAccount: () => void }) {
  const [step, setStep] = useState<Step>('details')
  const [guests, setGuests] = useState(initialGuests)
  const [checkIn, setCheckIn] = useState(dateValue(2))
  const [checkOut, setCheckOut] = useState(dateValue(4))
  const [units, setUnits] = useState<Unit[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [paying, setPaying] = useState(false)
  const [reservationKey] = useState(() => crypto.randomUUID())
  const [paymentKey] = useState(() => crypto.randomUUID())
  const [galleryOpen, setGalleryOpen] = useState(false)
  const [galleryIndex, setGalleryIndex] = useState(0)
  const [calendarMonth, setCalendarMonth] = useState(() => dateValue(2).slice(0, 7))
  const [calendarDates, setCalendarDates] = useState<AvailabilityDate[]>([])
  const [calendarLoading, setCalendarLoading] = useState(false)
  const [dateTarget, setDateTarget] = useState<'checkIn' | 'checkOut'>('checkIn')
  const photos = space.photos?.length ? space.photos : [space.image]
  const nights = Math.max(1, Math.round((new Date(`${checkOut}T00:00:00`).getTime() - new Date(`${checkIn}T00:00:00`).getTime()) / 86_400_000))
  const unit = units[0]
  const subtotal = (unit?.base_nightly_rate_naira ?? space.price) * nights
  const cleaning = unit?.cleaning_fee_naira ?? 0
  const service = Math.round(subtotal * 0.08)
  const total = useMemo(() => subtotal + cleaning + service, [subtotal, cleaning, service])

  useEffect(() => {
    if (!space.slug || checkIn >= checkOut) return
    let active = true
    setLoading(true); setError('')
    getAvailability(space.slug, checkIn, checkOut, guests)
      .then((result) => { if (active) setUnits(result.data) })
      .catch((cause) => { if (active) { setUnits([]); setError(cause instanceof ApiRequestError ? cause.message : 'Unable to check availability.') } })
      .finally(() => active && setLoading(false))
    return () => { active = false }
  }, [space.slug, checkIn, checkOut, guests])

  useEffect(() => {
    if (!space.slug) return
    let active = true
    setCalendarLoading(true)
    getAvailabilityCalendar(space.slug, calendarMonth, guests)
      .then((result) => { if (active) setCalendarDates(result.data) })
      .catch(() => { if (active) setCalendarDates([]) })
      .finally(() => active && setCalendarLoading(false))
    return () => { active = false }
  }, [space.slug, calendarMonth, guests])

  function selectCalendarDate(value: string) {
    if (dateTarget === 'checkIn') {
      setCheckIn(value)
      if (value >= checkOut) setCheckOut(addDays(value, 1))
      setDateTarget('checkOut')
      return
    }
    if (value <= checkIn) {
      setCheckIn(value)
      setCheckOut(addDays(value, 1))
    } else {
      setCheckOut(value)
    }
    setDateTarget('checkIn')
  }

  async function beginPayment() {
    if (!account) { onRequireAccount(); return }
    if (!unit) { setError('Choose different dates or fewer guests. This stay is not available for that selection.'); return }
    setPaying(true); setError('')
    try {
      const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${account.accessToken}` }
      const reservation = await apiRequest<{ data: { id: string } }>('/reservations', { method: 'POST', headers, body: JSON.stringify({ unitId: unit.id, checkIn, checkOut, guestCount: guests, idempotencyKey: reservationKey }) })
      const checkout = await apiRequest<{ data: { checkoutUrl: string } }>('/payments/checkout', { method: 'POST', headers, body: JSON.stringify({ reservationId: reservation.data.id, idempotencyKey: paymentKey }) })
      window.location.assign(checkout.data.checkoutUrl)
    } catch (cause) {
      setError(cause instanceof ApiRequestError ? cause.message : 'We could not start secure payment. Please try again.')
      setPaying(false)
    }
  }

  return <div className="checkout-backdrop" onMouseDown={onClose}><aside className="checkout" onMouseDown={(event) => event.stopPropagation()}><button className="checkout-close" onClick={onClose}><X size={19}/></button><div className="checkout-progress"><span className={step === 'details' ? 'active' : 'done'}>{step === 'details' ? '1' : <Check size={12}/>} Details</span><i/><span className={step === 'review' ? 'active' : ''}>2 Review</span><i/><span>3 Pay securely</span></div><header className="checkout-head"><p className="kicker">LIVE KUJE DEMO INVENTORY</p><h2>{step === 'details' ? 'Plan your stay.' : 'Review and pay securely.'}</h2></header><div className="checkout-layout"><section className="checkout-form">{step === 'details' ? <Details checkIn={checkIn} checkOut={checkOut} guests={guests} maxGuests={space.maxGuests ?? 20} setCheckIn={(value) => { setCheckIn(value); setDateTarget('checkIn') }} setCheckOut={(value) => { setCheckOut(value); setDateTarget('checkOut') }} setGuests={setGuests} loading={loading} units={units.length} calendarMonth={calendarMonth} calendarDates={calendarDates} calendarLoading={calendarLoading} dateTarget={dateTarget} setCalendarMonth={setCalendarMonth} onDateTarget={setDateTarget} onSelectCalendarDate={selectCalendarDate} /> : <Review account={account} />}{error && <p className="checkout-error"><AlertCircle size={16}/>{error}</p>}</section><aside className="order-summary"><button className="booking-cover" onClick={() => { setGalleryIndex(0); setGalleryOpen(true) }}><img src={space.image} alt={space.name}/><span>View {photos.length} photo{photos.length === 1 ? '' : 's'}</span></button><div className="summary-space"><small>Accommodation</small><h3>{space.name}</h3><p><MapPin size={13}/>{space.place}</p></div><div className="summary-line"><span>{nights} night{nights > 1 ? 's' : ''} <i>× {guests} guest{guests > 1 ? 's' : ''}</i></span><strong>₦{subtotal.toLocaleString()}</strong></div><div className="summary-line"><span>Cleaning + service fee</span><strong>₦{(cleaning + service).toLocaleString()}</strong></div><div className="summary-total"><span>Total</span><strong>₦{total.toLocaleString()}</strong></div><p className="summary-note"><ShieldCheck size={14}/> Availability is held only when you continue to payment.</p></aside></div><footer className="checkout-footer">{step === 'review' ? <button className="back-button" onClick={() => setStep('details')}><ArrowLeft size={16}/> Back</button> : <span><LockKeyhole size={14}/> HTTPS-secured booking</span>}<button className="continue-button" disabled={loading || !unit || paying} onClick={() => step === 'details' ? setStep('review') : beginPayment()}>{paying ? <><LoaderCircle size={15} className="spin"/> Opening Paystack…</> : step === 'details' ? <>Review reservation <ArrowRight size={16}/></> : <><LockKeyhole size={15}/> {account ? 'Continue to Paystack' : 'Sign in to continue'}</>}</button></footer>{galleryOpen && <div className="booking-gallery" onMouseDown={() => setGalleryOpen(false)}><section onMouseDown={(event) => event.stopPropagation()}><button onClick={() => setGalleryOpen(false)} aria-label="Close photos"><X size={18}/></button><img src={photos[galleryIndex]} alt={`${space.name} photo ${galleryIndex + 1}`}/><div>{photos.map((url, index) => <button className={index === galleryIndex ? 'active' : ''} key={url} onClick={() => setGalleryIndex(index)}><img src={url} alt={`View photo ${index + 1}`}/></button>)}</div></section></div>}</aside></div>
}

function Details({ checkIn, checkOut, guests, maxGuests, setCheckIn, setCheckOut, setGuests, loading, units, calendarMonth, calendarDates, calendarLoading, dateTarget, setCalendarMonth, onDateTarget, onSelectCalendarDate }: { checkIn: string; checkOut: string; guests: number; maxGuests: number; setCheckIn: (value: string) => void; setCheckOut: (value: string) => void; setGuests: (value: number) => void; loading: boolean; units: number; calendarMonth: string; calendarDates: AvailabilityDate[]; calendarLoading: boolean; dateTarget: 'checkIn' | 'checkOut'; setCalendarMonth: (value: string) => void; onDateTarget: (value: 'checkIn' | 'checkOut') => void; onSelectCalendarDate: (value: string) => void }) {
  const monthDate = new Date(`${calendarMonth}-01T00:00:00`)
  const firstWeekday = monthDate.getDay()
  const totalDays = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0).getDate()
  const datesByValue = new Map(calendarDates.map((day) => [day.date, day]))
  const monthLabel = monthDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
  const earliestMonth = dateValue(1).slice(0, 7)
  return <><h3>When are you visiting?</h3><div className="visit-grid live-date-grid"><label className={dateTarget === 'checkIn' ? 'selected-date-field' : ''}><CalendarDays size={18}/><span><small>CHECK IN</small><input aria-label="Check in" type="date" min={dateValue(1)} value={checkIn} onFocus={() => onDateTarget('checkIn')} onChange={(event) => setCheckIn(event.target.value)} /></span></label><label className={dateTarget === 'checkOut' ? 'selected-date-field' : ''}><CalendarDays size={18}/><span><small>CHECK OUT</small><input aria-label="Check out" type="date" min={checkIn} value={checkOut} onFocus={() => onDateTarget('checkOut')} onChange={(event) => setCheckOut(event.target.value)} /></span></label></div><section className="availability-calendar" aria-label="Live availability calendar"><div className="calendar-head"><div><b>Live availability</b><small>Select a {dateTarget === 'checkIn' ? 'check-in' : 'check-out'} date</small></div><div><button aria-label="Previous month" disabled={calendarMonth <= earliestMonth} onClick={() => setCalendarMonth(changeMonth(calendarMonth, -1))}><ArrowLeft size={14}/></button><strong>{monthLabel}</strong><button aria-label="Next month" onClick={() => setCalendarMonth(changeMonth(calendarMonth, 1))}><ArrowRight size={14}/></button></div></div><div className="calendar-weekdays">{['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => <span key={day}>{day}</span>)}</div><div className="calendar-days">{Array.from({ length: firstWeekday }).map((_, index) => <i key={`blank-${index}`}/>) }{Array.from({ length: totalDays }, (_, index) => { const value = `${calendarMonth}-${String(index + 1).padStart(2, '0')}`; const day = datesByValue.get(value); const unavailable = !calendarLoading && !!day && day.available_unit_count === 0; const past = value < dateValue(1); const selected = value === checkIn || value === checkOut; return <button key={value} className={`${selected ? 'selected' : ''} ${unavailable ? 'unavailable' : ''}`} disabled={past || unavailable || calendarLoading} onClick={() => onSelectCalendarDate(value)} aria-label={`${value}${unavailable ? ', unavailable' : ''}`}><span>{index + 1}</span>{unavailable ? <small>Taken</small> : day ? <small>{day.available_unit_count} open</small> : null}</button> })}</div><p className="calendar-legend"><span><i className="available"/>Available</span><span><i className="unavailable"/>Taken or host-blocked</span></p></section><h3>Who is this for?</h3><div className="guest-picker"><Users size={18}/><div><b>{guests} guest{guests > 1 ? 's' : ''}</b><small>Up to {maxGuests} guests</small></div><div><button onClick={() => setGuests(Math.max(1, guests - 1))}><Minus size={13}/></button><button disabled={guests >= maxGuests} onClick={() => setGuests(Math.min(maxGuests, guests + 1))}><Plus size={13}/></button></div></div><div className="policy-card"><ShieldCheck size={18}/><div><b>{loading ? 'Checking live availability…' : units ? `${units} unit${units > 1 ? 's' : ''} available for these dates` : 'No unit available for these dates'}</b><p>Taken dates include active reservations and host-blocked periods. Final availability is checked again before payment.</p></div></div></>
}
function Review({ account }: { account: Account | null }) { return <><h3>Payment</h3><div className="payment-options"><button className="selected"><CreditCard size={19}/><span><b>Paystack secure checkout</b><small>Card, transfer, USSD and available local options</small></span><i/></button></div><div className="review-notice"><LockKeyhole size={17}/><p>{account ? `You are booking as ${account.user.email}.` : 'Sign in or create a guest account to continue.'} We never collect or store card details.</p></div></> }
