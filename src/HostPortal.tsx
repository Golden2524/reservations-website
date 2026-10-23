import { FormEvent, useEffect, useState } from 'react'
import { Building2, Check, ChevronRight, CircleAlert, ClipboardCheck, HousePlus, LoaderCircle, RefreshCw, Send, X } from 'lucide-react'
import { ApiRequestError, type Account, type HostApplication, type HostProperty, createHostProperty, createHostUnit, getHostProperties, getMyHostApplication, submitHostApplication, submitHostProperty } from './api'

type Screen = 'overview' | 'property'
const messageFor = (error: unknown) => error instanceof ApiRequestError ? error.message : 'We could not complete that request. Please try again.'
const slugify = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')

export default function HostPortal({ account, onClose, onAccountChanged }: { account: Account; onClose: () => void; onAccountChanged: () => void }) {
  const [application, setApplication] = useState<HostApplication | null | undefined>(undefined)
  const [properties, setProperties] = useState<HostProperty[]>([])
  const [screen, setScreen] = useState<Screen>('overview')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  const refresh = async () => {
    setMessage('')
    try {
      if (account.user.role === 'HOST') {
        const result = await getHostProperties(account.accessToken)
        setProperties(result.data); setApplication(null)
      } else {
        const result = await getMyHostApplication(account.accessToken)
        setApplication(result.data)
      }
    } catch (error) { setMessage(messageFor(error)) }
  }
  useEffect(() => { void refresh() }, [])

  async function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage('')
    const form = new FormData(event.currentTarget)
    try {
      const result = await submitHostApplication(account.accessToken, { businessName: String(form.get('businessName')), businessPhone: String(form.get('businessPhone')), notes: String(form.get('notes') || '') })
      setApplication(result.data)
    } catch (error) { setMessage(messageFor(error)) } finally { setBusy(false) }
  }

  async function createProperty(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage('')
    const form = new FormData(event.currentTarget); const name = String(form.get('name'))
    try {
      const photoUrls = String(form.get('photoUrls')).split(/\n|,/).map((url) => url.trim()).filter(Boolean)
      const property = await createHostProperty(account.accessToken, { name, slug: slugify(name), description: form.get('description'), addressLine1: form.get('addressLine1'), area: form.get('area'), city: 'Kuje', state: 'FCT Abuja', photoUrls, checkInTime: form.get('checkInTime'), checkOutTime: form.get('checkOutTime') })
      await createHostUnit(account.accessToken, property.data.id, { name: form.get('unitName'), unitType: form.get('unitType'), description: form.get('unitDescription') || undefined, maxGuests: Number(form.get('maxGuests')), bedrooms: Number(form.get('bedrooms')), bathrooms: Number(form.get('bathrooms')), baseNightlyRateNaira: Number(form.get('rate')), cleaningFeeNaira: Number(form.get('cleaningFee')) })
      await submitHostProperty(account.accessToken, property.data.id)
      setMessage('Your property and first unit have been submitted for ReserveFlow review.'); setScreen('overview'); await refresh()
    } catch (error) { setMessage(messageFor(error)) } finally { setBusy(false) }
  }

  const host = account.user.role === 'HOST'
  return <div className="host-backdrop" onMouseDown={onClose}><section className="host-portal" onMouseDown={(event) => event.stopPropagation()} aria-label="Host partner portal">
    <button className="host-close" onClick={onClose} aria-label="Close partner portal"><X size={18}/></button>
    <header className="host-header"><div><p className="kicker">RESERVEFLOW PARTNERS</p><h2>{host ? 'Your host studio.' : 'List with intention.'}</h2><p>{host ? 'Manage your Kuje properties and send new spaces for review.' : 'A calm, reviewed path for accommodation operators joining ReserveFlow.'}</p></div><button className="host-refresh" onClick={() => void refresh()} aria-label="Refresh partner details"><RefreshCw size={16}/></button></header>
    {message && <p className="host-message" role="status"><CircleAlert size={16}/>{message}</p>}
    {!host && application === undefined && <div className="host-loading"><LoaderCircle className="spin" size={22}/> Loading your partner details…</div>}
    {!host && application === null && <form className="host-application" onSubmit={apply}><div className="host-steps"><span className="active">01 Business</span><span>02 Review</span><span>03 List</span></div><h3>Tell us about your accommodation business.</h3><p>We review every new host before their spaces can be published. You can continue booking as a guest while we review your application.</p><label>Business or property name<input name="businessName" required minLength={2} placeholder="e.g. Aso View Hospitality"/></label><label>Business phone<input name="businessPhone" required minLength={7} placeholder="0800 000 0000" inputMode="tel"/></label><label>Anything helpful for our review <small>Optional</small><textarea name="notes" maxLength={2000} placeholder="Number of rooms, location, or your hosting experience"/></label><button className="host-primary" disabled={busy}>{busy ? <LoaderCircle className="spin" size={16}/> : <Send size={16}/>} Submit host application</button></form>}
    {!host && application && <div className="host-application-status"><div className={`host-status-icon ${application.status.toLowerCase()}`}>{application.status === 'REJECTED' ? <CircleAlert size={23}/> : <ClipboardCheck size={23}/>}</div><p className="kicker">APPLICATION {application.status.replace('_', ' ')}</p><h3>{application.status === 'REJECTED' ? 'A little more detail is needed.' : 'Your host application is with our team.'}</h3><p>{application.status === 'REJECTED' ? application.review_note || 'Please update your business information and submit again.' : `We received ${application.business_name}. A ReserveFlow admin will review it before you can add public listings.`}</p>{application.status === 'REJECTED' && <button className="host-primary" onClick={() => setApplication(null)}>Update application <ChevronRight size={16}/></button>}<div className="host-next"><Check size={15}/><span>Approved already? Sign out and sign in again to refresh your host access.</span></div></div>}
    {host && screen === 'overview' && <div className="host-overview"><div className="host-stats"><article><small>PROPERTIES</small><strong>{properties.length}</strong><span>in your studio</span></article><article><small>UNITS</small><strong>{properties.reduce((total, property) => total + property.unit_count, 0)}</strong><span>configured</span></article><article><small>REVIEW QUEUE</small><strong>{properties.filter((property) => property.status === 'PENDING_REVIEW').length}</strong><span>awaiting approval</span></article></div><div className="host-property-head"><div><p className="kicker">YOUR KUJE PORTFOLIO</p><h3>Spaces in progress</h3></div><button className="host-primary compact" onClick={() => setScreen('property')}><HousePlus size={16}/> Add a property</button></div>{properties.length ? <div className="host-property-list">{properties.map((property) => <article key={property.id}><div className="host-property-mark"><Building2 size={18}/></div><div><strong>{property.name}</strong><span>{property.area}, {property.city} · {property.unit_count} unit{property.unit_count === 1 ? '' : 's'}</span></div><em className={property.status.toLowerCase()}>{property.status.replaceAll('_', ' ')}</em></article>)}</div> : <div className="host-empty"><Building2 size={23}/><h3>Your portfolio starts here.</h3><p>Add your first Kuje accommodation with a unit and nightly rate. It will go to review before publication.</p><button className="host-primary" onClick={() => setScreen('property')}>Add your first property <ChevronRight size={16}/></button></div>}</div>}
    {host && screen === 'property' && <form className="property-form" onSubmit={createProperty}><button className="host-back" type="button" onClick={() => setScreen('overview')}>← Back to portfolio</button><p className="kicker">NEW PROPERTY</p><h3>Set up your first bookable unit.</h3><p>Start with the essentials. Listings stay private until a ReserveFlow admin approves them.</p><div className="property-grid"><label>Property name<input name="name" required minLength={2} placeholder="e.g. Cedar Court Kuje"/></label><label>Area in Kuje<input name="area" required minLength={2} placeholder="e.g. Kuje Central"/></label><label className="full">Street address<input name="addressLine1" required minLength={5} placeholder="Your property address"/></label><label className="full">Property description<textarea name="description" required minLength={40} placeholder="Describe the stay, setting, and what guests can expect."/></label><label className="full">Property photo links <small>Required — one HTTPS image URL per line, up to 8</small><textarea name="photoUrls" required placeholder={'https://images.example.com/your-property-front.jpg\nhttps://images.example.com/your-room.jpg'}/></label><label>Check-in time<input name="checkInTime" type="time" defaultValue="14:00" required/></label><label>Check-out time<input name="checkOutTime" type="time" defaultValue="11:00" required/></label></div><div className="unit-section"><p className="kicker">FIRST UNIT</p><div className="property-grid"><label>Unit name<input name="unitName" required placeholder="e.g. Garden Studio"/></label><label>Unit type<input name="unitType" required placeholder="e.g. Studio apartment"/></label><label>Guests<input name="maxGuests" type="number" min="1" max="20" defaultValue="2" required/></label><label>Bedrooms<input name="bedrooms" type="number" min="0" max="20" defaultValue="1" required/></label><label>Bathrooms<input name="bathrooms" type="number" min="0.5" max="20" step="0.5" defaultValue="1" required/></label><label>Nightly rate (₦)<input name="rate" type="number" min="1000" required placeholder="25000"/></label><label>Cleaning fee (₦)<input name="cleaningFee" type="number" min="0" defaultValue="0" required/></label><label className="full">Unit details <small>Optional</small><textarea name="unitDescription" placeholder="Beds, work desk, kitchen, parking, and other details."/></label></div></div><button className="host-primary" disabled={busy}>{busy ? <LoaderCircle className="spin" size={16}/> : <Send size={16}/>} Submit property for review</button></form>}
  </section></div>
}
