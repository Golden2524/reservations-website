import { useEffect, useState } from 'react'
import { Check, Clock3, LoaderCircle, ShieldAlert, X } from 'lucide-react'
import { ApiRequestError, apiRequest } from './api'

type Account = { accessToken: string }
type PaymentState = { payment_status: string; reservation_status: string; public_reference: string; property_name: string }

export default function PaymentReturn({ account, onClose, onSignInRequired }: { account: Account | null; onClose: () => void; onSignInRequired: () => void }) {
  const reference = new URLSearchParams(window.location.search).get('reference')
  const [state, setState] = useState<PaymentState | null>(null)
  const [error, setError] = useState('')
  const [needsSignIn, setNeedsSignIn] = useState(!account)

  useEffect(() => {
    if (!reference || !account) return
    let active = true
    setNeedsSignIn(false)
    const check = async () => {
      try {
        const result = await apiRequest<{ data: PaymentState }>(`/payments/${reference}`, { headers: { Authorization: `Bearer ${account.accessToken}` } })
        if (active) setState(result.data)
      } catch (cause) {
        if (!active) return
        if (cause instanceof ApiRequestError && (cause.code === 'INVALID_ACCESS_TOKEN' || cause.code === 'AUTHENTICATION_REQUIRED')) {
          setNeedsSignIn(true)
          return
        }
        setError(cause instanceof ApiRequestError ? cause.message : 'Unable to verify payment yet.')
      }
    }
    void check()
    const timer = window.setInterval(() => void check(), 2500)
    return () => { active = false; window.clearInterval(timer) }
  }, [account, reference])

  if (!reference) return null
  const confirmed = state?.reservation_status === 'CONFIRMED'
  const needsReview = state?.payment_status === 'PAID' && !confirmed
  return <div className="payment-return"><section><button aria-label="Close payment status" onClick={onClose}><X size={18}/></button>{confirmed ? <><span className="return-icon success"><Check size={27}/></span><p className="kicker">PAYMENT VERIFIED</p><h2>Your stay is confirmed.</h2><p>{state?.property_name} is reserved under <b>{state?.public_reference}</b>. We’ll send the details to your booking email.</p></> : needsReview ? <><span className="return-icon warning"><ShieldAlert size={27}/></span><p className="kicker">PAYMENT RECEIVED</p><h2>We’re reviewing your booking.</h2><p>We received your payment, but the reservation hold had changed before confirmation. Our team will resolve this safely; do not make another payment.</p></> : needsSignIn ? <><span className="return-icon pending"><ShieldAlert size={27}/></span><p className="kicker">SIGN IN TO VERIFY</p><h2>Your payment is safe.</h2><p>For your privacy, sign in again with the guest account used for this booking. Your payment reference will stay on this page.</p><button className="return-done" onClick={onSignInRequired}>Sign in and verify</button></> : error ? <><span className="return-icon warning"><ShieldAlert size={27}/></span><p className="kicker">VERIFICATION NEEDED</p><h2>We’re checking your payment.</h2><p>{error} Keep this page open for a moment or check your reservation later.</p></> : <><span className="return-icon pending"><LoaderCircle size={27} className="spin"/></span><p className="kicker">VERIFYING PAYMENT</p><h2>Almost there.</h2><p>Paystack has returned you safely. We’re waiting for the signed payment confirmation from the provider.</p><small><Clock3 size={14}/> This usually takes a few seconds.</small></>} {!needsSignIn && <button className="return-done" onClick={onClose}>Back to ReserveFlow</button>}</section></div>
}
