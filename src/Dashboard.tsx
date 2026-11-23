import { ArrowRight, BarChart3, Building2, CalendarDays, Check, ChevronDown, CreditCard, Heart, MoreHorizontal, ShieldCheck, Sparkles, Users } from 'lucide-react'

export type DashboardRole = 'guest' | 'partner' | 'admin'

type View = { eyebrow: string; title: string; user: string; initials: string; userRole: string; cards: [string, string, string][] }

const views: Record<DashboardRole, View> = {
  guest: { eyebrow: 'GUEST ACCOUNT PREVIEW', title: 'Your reservation details.', user: 'Guest account', initials: 'GA', userRole: 'Account workspace', cards: [['RESERVATIONS', '—', 'view booking status'], ['SAVED STAYS', '—', 'keep options for later'], ['PAYMENTS', '—', 'track verified payments']] },
  partner: { eyebrow: 'HOST WORKSPACE PREVIEW', title: 'Manage your property.', user: 'Host account', initials: 'HA', userRole: 'Property operations', cards: [['ARRIVALS', '—', 'review upcoming stays'], ['AVAILABILITY', '—', 'manage blocked dates'], ['LISTINGS', '—', 'submit changes for review']] },
  admin: { eyebrow: 'OWNER WORKSPACE PREVIEW', title: 'Monitor platform activity.', user: 'ReserveFlow owner', initials: 'RF', userRole: 'Protected operations', cards: [['BOOKINGS', '—', 'review live status'], ['LISTING REVIEW', '—', 'approve partner updates'], ['SUPPORT', '—', 'manage open cases']] },
}

export default function Dashboard({ role }: { role: DashboardRole }) {
  const view = views[role]
  const nav = role === 'guest' ? ['Overview', 'Reservations', 'Saved spaces', 'Payments'] : role === 'partner' ? ['Overview', 'Reservations', 'Properties', 'Payouts'] : ['Overview', 'Reservations', 'Partner network', 'Payouts']
  const Icon = role === 'admin' ? ShieldCheck : role === 'partner' ? Building2 : Users
  return <div className="dashboard-demo"><aside className="dash-sidebar"><div className="dash-logo"><span><i/><i/><i/></span>reserveflow<b>.</b></div><div className="dash-nav">{nav.map((item, index) => <button className={index === 0 ? 'selected' : ''} key={item}>{index === 0 ? <BarChart3 size={16}/> : index === 1 ? <CalendarDays size={16}/> : index === 2 ? <Heart size={16}/> : <CreditCard size={16}/>} {item}{index === 1 && <em>{role === 'partner' ? '14' : role === 'admin' ? '9' : '2'}</em>}</button>)}</div><div className="dash-help"><Sparkles size={16}/><strong>Need a hand?</strong><small>Our support team is here.</small></div></aside><div className="dash-content"><header className="dash-top"><div><small>{view.eyebrow}</small><h3>{view.title}</h3></div><div className="dash-account"><span>{view.initials}</span><div><b>{view.user}</b><small>{view.userRole}</small></div><ChevronDown size={16}/></div></header><div className="dash-metrics">{view.cards.map(([label, value, note]) => <article key={label}><small>{label}</small><strong>{value}</strong><span>{note}</span></article>)}</div><RolePanel role={role} /></div></div>
}

function RolePanel({ role }: { role: DashboardRole }) {
  if (role === 'guest') return <section className="dash-list"><div className="dash-list-head"><div><small>UP NEXT</small><h4>Your upcoming reservations</h4></div><button>View all <ArrowRight size={15}/></button></div><div className="guest-reservation"><img src="https://images.unsplash.com/photo-1600607687920-4e2a09cf159d?auto=format&fit=crop&w=600&q=80" alt="The Glasshouse"/><div><span><Check size={11}/> Confirmed</span><h5>The Glasshouse</h5><p><CalendarDays size={13}/> Tue, 15 Oct — Thu, 17 Oct</p></div><button>View details <ArrowRight size={15}/></button></div></section>
  const partnerRows = [['10:00', 'Olivia Thomas', 'Garden Suite', 'Checked in'], ['12:30', 'Tunde Adeleke', 'Pool House', 'Arriving soon'], ['15:00', 'Nora Williams', 'Loft Residence', 'Confirmed']]
  const adminRows = [['!', 'Payment review', 'The Glasshouse · ₦84,000', '2 min ago'], ['↗', 'New partner application', 'Cedar Work Club', '18 min ago'], ['•', 'Cancellation request', 'Booking #RF-48291', '34 min ago']]
  const rows = role === 'partner' ? partnerRows : adminRows
  return <section className="dash-list"><div className="dash-list-head"><div><small>{role === 'partner' ? 'LIVE ARRIVALS' : 'ATTENTION QUEUE'}</small><h4>{role === 'partner' ? 'Today at The Glasshouse' : 'Things that need a decision'}</h4></div><button>{role === 'partner' ? 'Manage calendar' : 'Open operations'} <ArrowRight size={15}/></button></div>{rows.map((row) => <div className={role === 'admin' ? 'dash-row attention' : 'dash-row'} key={row[1]}><strong className="row-time">{row[0]}</strong><span className="row-avatar">{role === 'partner' ? row[1].split(' ').map((part) => part[0]).join('') : row[0]}</span><div><b>{row[1]}</b><small>{row[2]}</small></div><em>{row[3]}</em><MoreHorizontal size={18}/></div>)}</section>
}
