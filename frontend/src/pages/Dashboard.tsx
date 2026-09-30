import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bar as RBar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ArrowRight, FilePlus2 } from 'lucide-react'
import { api } from '../lib/api'
import type { Result } from '../lib/types'
import { ago, dayLabel, inrShort, pct0, TONE } from '../lib/format'
import { Button, Card, CardTitle, DecisionPill, Kpi, PageHead, SampleBadge, Skeleton, StatusPill } from '../components/ui'

interface Stats {
  total: number; by_decision: Record<string, number>; approval_rate: number; awaiting_review: number
  reviewed: number; overrides: number; avg_cibil: number | null; avg_foir: number | null
  daily: { date: string; APPROVE: number; REFER: number; DECLINE: number }[]
  attention_reasons: { reason: string; count: number }[]
  cibil_bands: { band: string; count: number; approve_rate: number }[]
}

const greeting = () => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening' }

export default function Dashboard() {
  const [s, setS] = useState<Stats | null>(null)
  const [recent, setRecent] = useState<Result[] | null>(null)
  const [err, setErr] = useState(false)
  useEffect(() => {
    api<Stats>('/stats').then(setS).catch(() => setErr(true))
    api<Result[]>('/applications?limit=6').then(setRecent).catch(() => setErr(true))
  }, [])

  const daily = s?.daily.map((d) => ({ ...d, label: dayLabel(d.date) })) || []
  const maxReason = Math.max(1, ...(s?.attention_reasons.map((r) => r.count) || [1]))

  return (
    <>
      <PageHead
        title={`${greeting()}`}
        sub={new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' }) + '. Here is how screening is going.'}
        right={<Link to="/new"><Button><FilePlus2 size={18} />New application</Button></Link>}
      />
      {err && <p className="mb-4 text-bad">Couldn't load the dashboard. Refresh the page to try again.</p>}

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Kpi label="Applications screened" value={s ? s.total : <Skeleton className="h-8 w-16" />} sub="All time, including sample data" />
        <Kpi label="Approval rate" value={s ? pct0(s.approval_rate) : <Skeleton className="h-8 w-16" />} tone="text-ok"
          sub={s && `${s.by_decision.APPROVE} approved, ${s.by_decision.DECLINE} declined`} />
        <Link to="/reviews" className="rounded-2xl outline-offset-2">
          <Kpi label="Awaiting review" value={s ? s.awaiting_review : <Skeleton className="h-8 w-16" />} tone="text-warn"
            sub={s && `${s.reviewed} reviewed, ${s.overrides} overrides`} />
        </Link>
        <Kpi label="Average EMI burden" value={s?.avg_foir != null ? `${(s.avg_foir * 100).toFixed(0)}%` : <Skeleton className="h-8 w-16" />}
          sub={s?.avg_cibil ? `Average CIBIL ${s.avg_cibil}` : undefined} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <Card>
          <CardTitle sub="Last 14 days, by Patrata's recommendation">Decisions per day</CardTitle>
          <div className="h-[260px]">
            {s ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={daily} margin={{ left: -24, right: 4, top: 4 }}>
                  <CartesianGrid vertical={false} stroke="#EBEEF3" />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#4A5468' }} tickLine={false} axisLine={false} interval={1} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#4A5468' }} tickLine={false} axisLine={false} />
                  <Tooltip cursor={{ fill: '#F2F4F7' }} contentStyle={{ borderRadius: 12, borderColor: '#D9DEE7', fontSize: 13 }} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: 13 }} />
                  <RBar dataKey="APPROVE" name="Approve" stackId="a" fill={TONE.APPROVE.hex} />
                  <RBar dataKey="REFER" name="Refer" stackId="a" fill={TONE.REFER.hex} />
                  <RBar dataKey="DECLINE" name="Decline" stackId="a" fill={TONE.DECLINE.hex} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : <Skeleton className="h-full w-full" />}
          </div>
        </Card>

        <Card>
          <CardTitle sub="Checks and flags that sent cases away from auto-approval">Why cases need attention</CardTitle>
          <div className="space-y-3">
            {s ? s.attention_reasons.map((r) => (
              <div key={r.reason}>
                <div className="mb-1 flex justify-between text-sm"><span>{r.reason}</span><b>{r.count}</b></div>
                <div className="h-2 rounded-full bg-line-2"><div className="h-2 rounded-full bg-warn-ink" style={{ width: `${(r.count / maxReason) * 100}%` }} /></div>
              </div>
            )) : [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-8 w-full" />)}
            {s && !s.attention_reasons.length && <p className="text-muted">Nothing flagged yet.</p>}
          </div>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_1.6fr]">
        <Card>
          <CardTitle sub="Share of each CIBIL band that Patrata approved">Approval by CIBIL band</CardTitle>
          <div className="h-[230px]">
            {s ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={s.cibil_bands} margin={{ left: -20, right: 4, top: 4 }}>
                  <CartesianGrid vertical={false} stroke="#EBEEF3" />
                  <XAxis dataKey="band" tick={{ fontSize: 11, fill: '#4A5468' }} tickLine={false} axisLine={false} />
                  <YAxis tickFormatter={(v) => `${Math.round(v * 100)}%`} domain={[0, 1]} tick={{ fontSize: 11, fill: '#4A5468' }} tickLine={false} axisLine={false} />
                  <Tooltip formatter={(v: any, _n: any, p: any) => [`${Math.round(v * 100)}% of ${p.payload.count}`, 'Approved']} contentStyle={{ borderRadius: 12, fontSize: 13 }} />
                  <RBar dataKey="approve_rate" fill="#1E2A5A" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : <Skeleton className="h-full w-full" />}
          </div>
        </Card>

        <Card>
          <CardTitle right={<Link to="/cases" className="flex items-center gap-1 text-sm font-medium underline-offset-4 hover:underline">All applications <ArrowRight size={15} /></Link>}>
            Recent applications
          </CardTitle>
          <ul className="divide-y divide-line-2">
            {recent ? recent.map((r) => (
              <li key={r.id}>
                <Link to={`/cases/${r.id}`} className="flex items-center justify-between gap-3 py-3 hover:bg-paper/60">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 font-medium">{inrShort(r.application.loan_amount)} over {r.application.loan_term} yrs {r.sample && <SampleBadge />}</p>
                    <p className="text-[13px] text-muted">CIBIL {r.application.cibil_score}, EMI burden {(r.foir * 100).toFixed(0)}%, {ago(r.created_at)}</p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1"><DecisionPill d={r.decision} /><span className="hidden sm:block"><StatusPill status={r.status} /></span></div>
                </Link>
              </li>
            )) : [0, 1, 2, 3].map((i) => <li key={i} className="py-3"><Skeleton className="h-10 w-full" /></li>)}
          </ul>
        </Card>
      </div>
      <p className="mt-4 text-[13px] text-muted">The dashboard includes generated sample applications (marked Sample) so the charts are meaningful in a demo. They are scored by the same model and rules as real checks.</p>
    </>
  )
}
