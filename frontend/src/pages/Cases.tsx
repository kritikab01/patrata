import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Search } from 'lucide-react'
import { api } from '../lib/api'
import type { Result } from '../lib/types'
import { ago, inr } from '../lib/format'
import { Card, cx, DecisionPill, PageHead, SampleBadge, Skeleton, StatusPill } from '../components/ui'

const TABS = [
  { key: 'all', label: 'All' },
  { key: 'review', label: 'Awaiting review' },
  { key: 'APPROVE', label: 'Approve' },
  { key: 'REFER', label: 'Refer' },
  { key: 'DECLINE', label: 'Decline' },
]

export default function Cases() {
  const [rows, setRows] = useState<Result[] | null>(null)
  const [tab, setTab] = useState('all')
  const [q, setQ] = useState('')
  const [err, setErr] = useState(false)
  useEffect(() => { api<Result[]>('/applications?limit=500').then(setRows).catch(() => setErr(true)) }, [])

  const shown = useMemo(() => (rows || []).filter((r) =>
    (tab === 'all' || (tab === 'review' ? r.status === 'Awaiting review' : r.decision === tab)) &&
    (!q || r.id.includes(q.trim().toLowerCase()) || String(r.application.cibil_score).includes(q.trim()))), [rows, tab, q])
  const count = (k: string) => (rows || []).filter((r) => k === 'all' || (k === 'review' ? r.status === 'Awaiting review' : r.decision === k)).length

  return (
    <>
      <PageHead title="Applications" sub="Every check is kept with its model version, so any decision can be traced later." />
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0" role="tablist">
          {TABS.map((t) => (
            <button key={t.key} role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)}
              className={cx('min-h-10 shrink-0 rounded-full px-4 text-sm', tab === t.key ? 'bg-ink font-semibold text-white' : 'border border-line bg-white text-muted hover:text-ink')}>
              {t.label} <span className="opacity-70">{rows ? count(t.key) : ''}</span>
            </button>
          ))}
        </div>
        <label className="relative sm:w-64">
          <span className="sr-only">Search by application ID or CIBIL score</span>
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden="true" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search ID or CIBIL" className="h-11 w-full rounded-xl border border-field bg-white pl-9 pr-3 outline-none focus:border-ink" />
        </label>
      </div>
      {err && <p className="text-bad">Couldn't load applications.</p>}
      <Card className="p-0 sm:p-0">
        <div className="hidden grid-cols-[1.1fr_1.3fr_0.7fr_0.8fr_0.9fr_1.3fr] gap-3 border-b border-line px-5 py-3 text-[13px] text-muted md:grid">
          <span>Application</span><span>Loan</span><span>CIBIL</span><span>EMI burden</span><span>Recommendation</span><span>Status</span>
        </div>
        <ul className="divide-y divide-line-2">
          {!rows ? [0, 1, 2, 3, 4].map((i) => <li key={i} className="p-5"><Skeleton className="h-8" /></li>) :
            !shown.length ? <li className="p-8 text-center text-muted">No applications here yet.</li> :
            shown.map((r) => (
              <li key={r.id}>
                <Link to={`/cases/${r.id}`} className="grid grid-cols-[1fr_auto] gap-2 px-5 py-4 hover:bg-paper/60 md:grid-cols-[1.1fr_1.3fr_0.7fr_0.8fr_0.9fr_1.3fr] md:items-center md:gap-3">
                  <div className="min-w-0"><p className="flex items-center gap-2 font-mono text-[13px]">{r.id} {r.sample && <SampleBadge />}</p><p className="text-[13px] text-muted">{ago(r.created_at)}</p></div>
                  <p className="hidden md:block">{inr(r.application.loan_amount)} <span className="text-muted">/ {r.application.loan_term} yrs</span></p>
                  <p className="hidden md:block">{r.application.cibil_score}</p>
                  <p className={cx('hidden md:block', r.foir > 0.65 ? 'text-bad' : r.foir > 0.5 ? 'text-warn' : '')}>{(r.foir * 100).toFixed(0)}%</p>
                  <span className="justify-self-end md:justify-self-start"><DecisionPill d={r.decision} /></span>
                  <p className="col-span-2 text-[13px] text-muted md:hidden">{inr(r.application.loan_amount)} over {r.application.loan_term} yrs, CIBIL {r.application.cibil_score}, EMI burden {(r.foir * 100).toFixed(0)}%</p>
                  <span className="col-span-2 md:col-span-1"><StatusPill status={r.status} /></span>
                </Link>
              </li>
            ))}
        </ul>
      </Card>
    </>
  )
}
