import { useEffect, useState } from 'react'
import { NavLink, Route, Routes, useLocation } from 'react-router-dom'
import { Bot, ClipboardCheck, FilePlus2, FolderKanban, Gauge, Layers, MoreHorizontal, ShieldCheck, X } from 'lucide-react'
import { api } from './lib/api'
import { cx } from './components/ui'
import ErrorBoundary from './components/ErrorBoundary'
import Dashboard from './pages/Dashboard'
import NewApplication from './pages/NewApplication'
import Cases from './pages/Cases'
import CaseDetail from './pages/CaseDetail'
import Reviews from './pages/Reviews'
import Batch from './pages/Batch'
import Assistant from './pages/Assistant'
import ModelCard from './pages/ModelCard'

const NAV = [
  { to: '/', label: 'Dashboard', icon: Gauge, end: true },
  { to: '/new', label: 'New application', icon: FilePlus2 },
  { to: '/cases', label: 'Applications', icon: FolderKanban },
  { to: '/reviews', label: 'Review queue', icon: ClipboardCheck, badge: true },
  { to: '/batch', label: 'Batch screening', icon: Layers },
  { to: '/assistant', label: 'Assistant', icon: Bot },
  { to: '/model', label: 'Model and governance', icon: ShieldCheck },
]
const MOBILE = ['/', '/new', '/cases', '/assistant']

function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <svg width="30" height="30" viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="8" fill="#0A0A0A" /><path d="M11 24V8h6.5a5 5 0 0 1 0 10H11" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg>
      <div className="leading-none">
        <div className="text-[19px] font-bold tracking-tight">Patrata</div>
        <div lang="hi" className="mt-0.5 text-[12px] text-muted">पात्रता</div>
      </div>
    </div>
  )
}

function useStatus() {
  const [s, setS] = useState<{ ok: boolean | null; ai: boolean; queue: number }>({ ok: null, ai: false, queue: 0 })
  const { pathname } = useLocation()
  useEffect(() => {
    let off = false
    Promise.all([api('/health'), api('/stats')])
      .then(([h, st]) => !off && setS({ ok: true, ai: h.llm_configured, queue: st.awaiting_review }))
      .catch(() => !off && setS((p) => ({ ...p, ok: false })))
    return () => { off = true }
  }, [pathname])
  return s
}

export default function App() {
  const status = useStatus()
  const [more, setMore] = useState(false)
  const { pathname } = useLocation()
  useEffect(() => { setMore(false); window.scrollTo(0, 0) }, [pathname])

  const statusChip = (
    <span className="flex items-center gap-2 text-[13px] text-muted" aria-live="polite">
      <span className={cx('h-2 w-2 rounded-full', status.ok === null ? 'bg-faint pulse-dot' : status.ok ? 'bg-ok' : 'bg-bad')} />
      {status.ok === null ? 'Connecting' : status.ok ? (status.ai ? 'Online, AI on' : 'Online, AI off') : 'Offline'}
    </span>
  )

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[256px_1fr]">
      {/* Sidebar (laptop) */}
      <aside className="no-print sticky top-0 hidden h-screen flex-col border-r border-line bg-white px-4 py-6 lg:flex">
        <div className="px-2"><Logo /></div>
        <nav className="mt-8 flex flex-col gap-1" aria-label="Main">
          {NAV.map(({ to, label, icon: Icon, end, badge }) => (
            <NavLink key={to} to={to} end={end}
              className={({ isActive }) => cx('flex min-h-11 items-center gap-3 rounded-xl px-3 text-[15px]', isActive ? 'bg-ink font-semibold text-white' : 'text-muted hover:bg-paper hover:text-ink')}>
              <Icon size={19} aria-hidden="true" />
              <span className="flex-1">{label}</span>
              {badge && status.queue > 0 && <span className="rounded-full bg-warn-bg px-2 text-[12px] font-semibold text-warn">{status.queue}</span>}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto space-y-3 px-2">
          {statusChip}
          <p className="text-[12px] leading-relaxed text-muted">Decision support only. A credit officer makes the final call.</p>
        </div>
      </aside>

      <div className="min-w-0">
        {/* Top bar (phone) */}
        <header className="no-print sticky top-0 z-20 flex items-center justify-between border-b border-line bg-paper/95 px-4 py-3 backdrop-blur lg:hidden" style={{ paddingTop: 'max(12px, env(safe-area-inset-top))' }}>
          <Logo />
          {statusChip}
        </header>

        <main className="mx-auto w-full max-w-[1180px] px-4 pb-28 pt-5 sm:px-6 lg:px-10 lg:pb-12 lg:pt-8">
          <ErrorBoundary key={pathname}>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/new" element={<NewApplication />} />
            <Route path="/cases" element={<Cases />} />
            <Route path="/cases/:id" element={<CaseDetail />} />
            <Route path="/reviews" element={<Reviews />} />
            <Route path="/batch" element={<Batch />} />
            <Route path="/assistant" element={<Assistant />} />
            <Route path="/model" element={<ModelCard />} />
            <Route path="*" element={<div className="py-20 text-center"><p className="text-lg font-semibold">Page not found</p><NavLink className="mt-3 inline-block underline" to="/">Go to the dashboard</NavLink></div>} />
          </Routes>
          </ErrorBoundary>
        </main>
      </div>

      {/* Bottom tabs (phone) */}
      <nav className="no-print fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white lg:hidden" aria-label="Main" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="mx-auto grid max-w-lg grid-cols-5">
          {NAV.filter((n) => MOBILE.includes(n.to)).map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end}
              className={({ isActive }) => cx('flex min-h-[58px] flex-col items-center justify-center gap-0.5 text-[11px]', isActive ? 'font-semibold text-ink' : 'text-muted')}>
              <Icon size={21} aria-hidden="true" />
              {label === 'New application' ? 'New' : label === 'Applications' ? 'Cases' : label}
            </NavLink>
          ))}
          <button type="button" onClick={() => setMore(true)} className="relative flex min-h-[58px] flex-col items-center justify-center gap-0.5 text-[11px] text-muted" aria-haspopup="dialog">
            <MoreHorizontal size={21} aria-hidden="true" />More
            {status.queue > 0 && <span className="absolute right-4 top-2 h-2 w-2 rounded-full bg-warn-ink" />}
          </button>
        </div>
      </nav>

      {more && (
        <div className="no-print fixed inset-0 z-40 bg-ink/40 lg:hidden" onClick={() => setMore(false)}>
          <div role="dialog" aria-label="More" className="absolute inset-x-0 bottom-0 rounded-t-3xl bg-white p-5 pb-8" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <p className="font-semibold">More</p>
              <button type="button" aria-label="Close" onClick={() => setMore(false)} className="grid h-10 w-10 place-items-center rounded-full hover:bg-paper"><X size={20} /></button>
            </div>
            {NAV.filter((n) => !MOBILE.includes(n.to)).map(({ to, label, icon: Icon, badge }) => (
              <NavLink key={to} to={to} className="flex min-h-12 items-center gap-3 rounded-xl px-2 text-[15px] hover:bg-paper">
                <Icon size={20} aria-hidden="true" /><span className="flex-1">{label}</span>
                {badge && status.queue > 0 && <span className="rounded-full bg-warn-bg px-2 text-[12px] font-semibold text-warn">{status.queue}</span>}
              </NavLink>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
