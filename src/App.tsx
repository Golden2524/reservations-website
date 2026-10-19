import { useEffect, useMemo, useState } from 'react'
import {
  ArrowRight, Bell, CalendarDays, Check, ChevronDown, Clock3, Compass,
  Heart, MapPin, Menu, Minus, Plus, Search, ShieldCheck, Sparkles,
  Users, Zap,
} from 'lucide-react'
import Dashboard, { type DashboardRole } from './Dashboard'
import Marketplace from './Marketplace'
import Checkout from './Checkout'
import ReservationsHub from './ReservationsHub'
import { getApiHealth, getProperties, type Property } from './api'
import AccountDialog from './AccountDialog'
import PaymentReturn from './PaymentReturn'
import MyReservations from './MyReservations'

export type Space = { name: string; kind: string; place: string; price: number; image: string; status: string; seats: string; slug?: string; maxGuests?: number }

const spaces: Space[] = [
  { name: 'The Glasshouse', kind: 'Boutique stay', place: 'Victoria Island, Lagos', price: 84000, image: 'https://images.unsplash.com/photo-1600607687920-4e2a09cf159d?auto=format&fit=crop&w=1200&q=85', status: 'Only 2 suites left', seats: '2 guests' },
  { name: 'Sonder Social', kind: 'Creative workspace', place: 'Ikoyi, Lagos', price: 12500, image: 'https://images.unsplash.com/photo-1497366811353-6870744d04b2?auto=format&fit=crop&w=1200&q=85', status: '9 desks available', seats: '1–6 people' },
  { name: 'Axis Health', kind: 'Specialist clinic', place: 'Lekki Phase 1, Lagos', price: 18000, image: 'https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?auto=format&fit=crop&w=1200&q=85', status: 'Next slot: 10:30', seats: '45 min session' },
]

const dates = ['MON 14', 'TUE 15', 'WED 16', 'THU 17', 'FRI 18']
const liveImages: Record<string, string> = {
  'aso-view-courtyard': 'https://images.unsplash.com/photo-1600607687920-4e2a09cf159d?auto=format&fit=crop&w=1200&q=85',
  'maple-house-kuje': 'https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?auto=format&fit=crop&w=1200&q=85',
  'green-haven-lodge': 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1200&q=85',
}
const asLiveSpace = (property: Property): Space => ({ name: property.name, kind: 'Kuje accommodation', place: `${property.area}, ${property.city}`, price: property.from_nightly_rate_naira, image: liveImages[property.slug] ?? spaces[0].image, status: 'Live availability', seats: `Up to ${property.maximum_guests} guests`, slug: property.slug, maxGuests: property.maximum_guests })

export default function App() {
  const [selectedDate, setSelectedDate] = useState(1)
  const [guests, setGuests] = useState(2)
  const [selectedSpace, setSelectedSpace] = useState<Space | null>(null)
  const [saved, setSaved] = useState<string[]>([])
  const [menuOpen, setMenuOpen] = useState(false)
  const [activeRole, setActiveRole] = useState<DashboardRole>('guest')
  const [notice, setNotice] = useState('')
  const [apiStatus, setApiStatus] = useState<'checking' | 'live' | 'offline'>('checking')
  const [liveSpaces, setLiveSpaces] = useState<Space[]>([])
  const [catalogueState, setCatalogueState] = useState<'loading' | 'ready' | 'unavailable'>('loading')
  const [accountOpen, setAccountOpen] = useState(false)
  const [reservationsOpen, setReservationsOpen] = useState(false)
  const [account, setAccount] = useState<{ accessToken: string; user: { firstName: string; lastName: string; email: string; role: string } } | null>(() => {
    try { return JSON.parse(sessionStorage.getItem('reserveflow.account') ?? 'null') } catch { return null }
  })
  const availability = useMemo(() => 34 - selectedDate * 3, [selectedDate])

  useEffect(() => {
    let active = true
    getApiHealth()
      .then(() => active && setApiStatus('live'))
      .catch(() => active && setApiStatus('offline'))
    return () => { active = false }
  }, [])

  useEffect(() => {
    let active = true
    getProperties(guests)
      .then((result) => { if (active) { setLiveSpaces(result.data.map(asLiveSpace)); setCatalogueState('ready') } })
      .catch(() => active && setCatalogueState('unavailable'))
    return () => { active = false }
  }, [guests])

  const toggleSaved = (name: string) => setSaved((items) => items.includes(name) ? items.filter((item) => item !== name) : [...items, name])

  return (
    <main>
      <nav className="nav shell">
        <a className="brand" href="#top" aria-label="ReserveFlow home"><span className="brand-mark"><i /><i /><i /></span>reserveflow<span className="dot">.</span></a>
        <div className={menuOpen ? 'nav-links open' : 'nav-links'}>
          <a href="#explore" onClick={() => setMenuOpen(false)}>Explore</a><a href="#partners" onClick={() => setMenuOpen(false)}>For partners</a><a href="#how" onClick={() => setMenuOpen(false)}>How it works</a>
        </div>
        <div className="nav-actions"><span className={`api-status ${apiStatus}`} title={apiStatus === 'live' ? 'Secure booking service connected' : apiStatus === 'offline' ? 'Booking service temporarily unavailable' : 'Checking booking service'}><i />{apiStatus === 'live' ? 'Booking live' : apiStatus === 'offline' ? 'Service offline' : 'Connecting'}</span><button className="icon-button" aria-label="Show notifications" onClick={() => setNotice('You’re all caught up — no new reservation updates.')}><Bell size={18} /></button><button className="avatar" aria-label={account ? 'Open your reservations' : 'Create or sign in to your account'} onClick={() => account ? setReservationsOpen(true) : setAccountOpen(true)}>{account ? `${account.user.firstName[0]}${account.user.lastName[0]}`.toUpperCase() : 'AM'}</button><button className="menu-button" aria-label="Toggle navigation menu" aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}><Menu size={22} /></button></div>
      </nav>

      <section id="top" className="hero shell">
        <div className="eyebrow"><span /> The new standard for booking</div>
        <h1>Make space for<br /><em>what matters.</em></h1>
        <p className="hero-copy">Exceptional stays, energising workspaces, and care you can count on — all in one thoughtful reservation experience.</p>
        <div className="booking-bar">
          <div className="booking-field"><MapPin size={19} /><div><small>Where</small><strong>Lagos, Nigeria</strong></div><ChevronDown size={17} /></div>
          <div className="booking-field"><CalendarDays size={19} /><div><small>When</small><strong>14 — 16 October</strong></div><ChevronDown size={17} /></div>
          <div className="booking-field"><Users size={19} /><div><small>Guests</small><strong>{guests} guest{guests > 1 ? 's' : ''}</strong></div><span className="guest-stepper"><button onClick={() => setGuests(Math.max(1, guests - 1))}><Minus size={12}/></button><button onClick={() => setGuests(guests + 1)}><Plus size={12}/></button></span></div>
          <button className="search-button" onClick={() => document.getElementById('explore')?.scrollIntoView({ behavior: 'smooth' })}><Search size={20} /> <span>Find a space</span></button>
        </div>
        <div className="hero-meta"><span><ShieldCheck size={16}/> Verified spaces & providers</span><span><Zap size={16}/> Instant confirmation</span><span><Heart size={16}/> Built around you</span></div>
        <div className="hero-visual">
          <div className="hero-photo"><img src="https://images.unsplash.com/photo-1613490493576-7fde63acd811?auto=format&fit=crop&w=1800&q=85" alt="Modern home with a pool" /><div className="photo-tint" /></div>
          <div className="floating-card score-card"><span className="mini-icon"><Sparkles size={15}/></span><div><small>Guest favourite</small><strong>4.98 <span>★</span></strong></div></div>
          <div className="floating-card availability-card"><span className="live-dot"/><div><small>Live availability</small><strong>{availability} spaces open today</strong></div></div>
          <div className="location-chip"><MapPin size={15}/> Curated for Lagos</div>
        </div>
      </section>

      <section className="trust-band"><div className="shell trust-inner"><p>Trusted by people who value their time.</p><div><strong>12K<span>+</span></strong><small>happy bookers</small></div><div><strong>480<span>+</span></strong><small>remarkable spaces</small></div><div><strong>98<span>%</span></strong><small>would book again</small></div></div></section>

      <section id="explore" className="explore shell">
        <div className="section-heading"><div><p className="kicker">LIVE KUJE DEMO CATALOGUE</p><h2>Find your perfect <em>place.</em></h2></div><a href="#all">Browse all spaces <ArrowRight size={18}/></a></div>
        <div className="date-strip"><button className="date-arrow">‹</button>{dates.map((date, index) => <button key={date} onClick={() => setSelectedDate(index)} className={selectedDate === index ? 'date active' : 'date'}>{date}</button>)}<button className="date-arrow">›</button></div>
        <div className="space-grid">
          {(liveSpaces.length ? liveSpaces : spaces).map((space) => <article className="space-card" key={space.name}>
            <div className="space-image"><img src={space.image} alt={space.name} /><span className="pill">{space.kind}</span><button aria-label={`${saved.includes(space.name) ? 'Remove' : 'Save'} ${space.name}`} className={saved.includes(space.name) ? 'save saved' : 'save'} onClick={() => { toggleSaved(space.name); setNotice(saved.includes(space.name) ? `${space.name} removed from saved spaces.` : `${space.name} saved for later.`) }}><Heart size={18} fill={saved.includes(space.name) ? 'currentColor' : 'none'} /></button><div className="image-status"><span className="live-dot"/>{space.status}</div></div>
            <div className="space-info"><p>{space.place}</p><h3>{space.name}</h3><div className="space-bottom"><span><strong>₦{space.price.toLocaleString()}</strong> <small>/ {space.slug ? 'night' : 'session'}</small></span><button onClick={() => space.slug ? setSelectedSpace(space) : setNotice(catalogueState === 'unavailable' ? 'Live catalogue is temporarily unavailable. Please try again shortly.' : 'This showcase card is not connected to checkout. Choose a live Kuje listing.')}>{space.slug ? <>Book now <ArrowRight size={16}/></> : 'Showcase only'}</button></div></div>
          </article>)}
        </div>
      </section>

      <Marketplace onReserve={() => setNotice('The marketplace cards are design showcases. Use a live Kuje listing above to test the reservation flow.')} />

      <ReservationsHub />

      <section id="how" className="how"><div className="shell how-inner"><div className="how-copy"><p className="kicker">SIMPLE BY DESIGN</p><h2>Good plans<br />start <em>here.</em></h2><p>Every detail is designed to remove friction, so you can get on with making the most of your time.</p><a href="#explore" className="text-link">Discover the experience <ArrowRight size={18}/></a></div><div className="steps"><div><span>01</span><h3>Find your fit</h3><p>Search a trusted collection of spaces and services that feel just right.</p></div><div><span>02</span><h3>Book in seconds</h3><p>See live availability, choose your time, and confirm without the back-and-forth.</p></div><div><span>03</span><h3>Show up present</h3><p>Everything is in one calm place — from access details to useful reminders.</p></div></div></div></section>

      <section id="partners" className="partner shell"><div className="partner-art"><img src="https://images.unsplash.com/photo-1556761175-b413da4baf72?auto=format&fit=crop&w=1000&q=85" alt="Team collaborating at a table" /><div className="partner-tag"><Compass size={18}/><span>One platform.<br/><strong>Endless potential.</strong></span></div></div><div className="partner-copy"><p className="kicker">FOR SPACE MAKERS</p><h2>Your craft<br />deserves <em>better tools.</em></h2><p>From boutique hosts to ambitious teams, ReserveFlow gives you a refined way to manage availability, welcome guests, and grow on your terms.</p><button className="dark-button">Become a partner <ArrowRight size={18}/></button></div></section>

      <section id="platform" className="platform"><div className="shell"><div className="platform-heading"><div><p className="kicker">THE OPERATING SYSTEM FOR RESERVATIONS</p><h2>One platform.<br/><em>Every perspective.</em></h2></div><p>See how ReserveFlow gives every participant the right information and controls at exactly the right moment.</p></div><div className="role-tabs" role="tablist" aria-label="Dashboard demo roles">{([['guest', 'Guest'], ['partner', 'Partner'], ['admin', 'Admin']] as const).map(([value, label]) => <button key={value} className={activeRole === value ? 'active' : ''} onClick={() => setActiveRole(value)} role="tab" aria-selected={activeRole === value}>{label}</button>)}</div><Dashboard role={activeRole} /></div></section>

      <footer><div className="shell footer-inner"><a className="brand" href="#top"><span className="brand-mark"><i /><i /><i /></span>reserveflow<span className="dot">.</span></a><p>Make space for what matters.</p><span>© 2026 ReserveFlow</span></div></footer>

      {notice && <div className="app-notice" role="status"><Check size={15}/>{notice}<button aria-label="Dismiss notification" onClick={() => setNotice('')}>×</button></div>}
      {accountOpen && <AccountDialog onClose={() => setAccountOpen(false)} onAuthenticated={(nextAccount) => { setAccount(nextAccount); setAccountOpen(false); setNotice(`Welcome, ${nextAccount.user.firstName}. Your guest account is ready.`) }} />}
      {reservationsOpen && account && <MyReservations account={account} onClose={() => setReservationsOpen(false)} />}
      <PaymentReturn account={account} onClose={() => { window.history.replaceState({}, '', window.location.pathname); setNotice('Payment status check closed. You can view your reservation from your account shortly.') }} />
      {selectedSpace && <Checkout space={selectedSpace} initialGuests={guests} account={account} onClose={() => setSelectedSpace(null)} onRequireAccount={() => { setSelectedSpace(null); setAccountOpen(true); setNotice('Create or sign in to a guest account, then choose your stay again.') }} />}
    </main>
  )
}
