import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight, Inbox } from 'lucide-react'
import { api } from '../lib/api'
import type { Result } from '../lib/types'
import { ago, inr } from '../lib/format'
import { Card, PageHead, SampleBadge, Skeleton } from '../components/ui'

export default function Reviews() {
  const [rows, setRows] = useState<Result[] | null>(null)
  useEffect(() => { api<Result[]>('/reviews/queue').then(setRows).catch(() => setRows([])) }, [])
  return (
    <>
      <PageHead title="Review queue" sub="Referred applications waiting for a credit manager. Oldest first. Each final decision needs a written reason, which is kept in the audit trail." />
      {!rows ? <Skeleton className="h-40 w-full rounded-2xl" /> : !rows.length ? (
        <Card className="py-12 text-center"><Inbox className="mx-auto text-faint" size={36} /><p className="mt-3 font-semibold">The queue is clear</p><p className="text-muted">Referred applications will appear here.</p></Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {rows.map((r) => {
            const why = r.rule_checks.filter((c) => c.status !== 'pass').map((c) => `${c.label} ${c.value}`)
            if (r.flags.includes('outside_training_range')) why.push('Outside training data')
            if (!why.length) why.push('Model unsure')
            return (
              <Link key={r.id} to={`/cases/${r.id}`} className="group rounded-2xl border border-line bg-white p-5 hover:border-ink">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="flex items-center gap-2 text-[13px] text-muted"><span className="font-mono">{r.id}</span>{r.sample && <SampleBadge />}</p>
                    <p className="mt-1 text-lg font-semibold">{inr(r.application.loan_amount)} over {r.application.loan_term} years</p>
                  </div>
                  <ChevronRight className="mt-1 text-faint group-hover:text-ink" />
                </div>
                <div className="mt-3 flex flex-wrap gap-2">{why.map((w) => <span key={w} className="rounded-full bg-warn-bg px-2.5 py-0.5 text-[13px] text-warn">{w}</span>)}</div>
                <p className="mt-3 text-[13px] text-muted">CIBIL {r.application.cibil_score}, income {inr(r.application.income_annum)} a year. Waiting {ago(r.created_at).replace(' ago', '')}.</p>
              </Link>
            )
          })}
        </div>
      )}
    </>
  )
}
