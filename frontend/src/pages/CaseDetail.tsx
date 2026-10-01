import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, FileDown, PencilLine, Plus } from 'lucide-react'
import { api, newRequestId } from '../lib/api'
import type { Application, Lang, Result } from '../lib/types'
import { pct, when, WORD } from '../lib/format'
import { AskCase, Change, Checks, Drivers, ExplanationCard, PrintNote, ReviewPanel, RiskCard, StatusTracker, WhatIf } from '../components/result'
import { Bar, Button, Card, Notice, SampleBadge, Skeleton, Stamp, StatusPill } from '../components/ui'

export default function CaseDetail() {
  const { id = '' } = useParams()
  const nav = useNavigate()
  const { state } = useLocation() as { state?: { result?: Result } }
  const [r, setR] = useState<Result | null>(state?.result?.id === id ? state.result : null)
  const [missing, setMissing] = useState(false)
  const [lang, setLang] = useState<Lang>('en')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (r?.id === id) return
    setR(null); setMissing(false)
    api<Result>(`/applications/${id}`).then(setR).catch(() => setMissing(true))   // survives a refresh
  }, [id])

  async function recheck(a: Application) {
    setBusy(true)
    try {
      const res = await api<Result>('/score', { json: { ...a, request_id: newRequestId() } })
      nav(`/cases/${res.id}`, { state: { result: res } })
    } finally { setBusy(false) }
  }

  if (missing) return (
    <Card className="mx-auto max-w-lg text-center">
      <p className="text-lg font-semibold">This application isn't available</p>
      <p className="mt-1 text-muted">It may have been cleared when the server restarted.</p>
      <Link to="/new"><Button className="mt-4">Start a new check</Button></Link>
    </Card>
  )
  if (!r) return <div className="space-y-4"><Skeleton className="h-40 w-full rounded-2xl" /><Skeleton className="h-64 w-full rounded-2xl" /></div>

  const conflict = r.flags.includes('model_policy_conflict')
  const ood = r.flags.includes('outside_training_range')
  const soft = r.rule_checks.filter((c) => c.status !== 'pass')

  return (
    <>
      <div className="no-print">
        <Link to="/cases" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink"><ArrowLeft size={16} />Applications</Link>

        <Card className="relative overflow-hidden">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-2 text-[13px] text-muted">Application {r.id}, checked {when(r.created_at)} {r.sample && <SampleBadge />}</p>
              <h1 className="mt-1.5 text-[26px] font-semibold leading-tight tracking-tight sm:text-[32px]">{WORD[r.decision]}</h1>
              <p className="mt-1 text-muted">{r.decision === 'APPROVE' ? 'All policy checks pass.' : soft.length ? `${soft.map((c) => c.label).join(' and ')} ${soft.length > 1 ? 'need' : 'needs'} attention.` : r.reasons[0]}</p>
              <div className="mt-3"><StatusPill status={r.status} /></div>
            </div>
            <Stamp d={r.decision} />
          </div>

          <div className="mt-5">
            <div className="mb-1.5 flex items-baseline justify-between"><span className="text-sm text-muted">Model approval likelihood</span><b className="text-xl">{pct(r.approval_probability)}</b></div>
            <Bar value={r.approval_probability} label={`Approval likelihood ${pct(r.approval_probability)}`} />
          </div>

          <div className="mt-4 space-y-2">
            {conflict && <Notice title="The model and the policy disagree.">{r.reasons[r.reasons.length - 1]}</Notice>}
            {ood && <Notice tone="info">{r.reasons.find((x) => x.startsWith('These inputs')) || 'These inputs are outside the training data.'}</Notice>}
            {r.warnings.map((w) => <Notice key={w}>{w}</Notice>)}
          </div>

          <div className="mt-5 border-t border-line-2 pt-5"><StatusTracker r={r} /></div>

          <div className="mt-5 flex flex-wrap gap-2">
            <Button kind="ghost" onClick={() => window.print()}><FileDown size={17} />Download decision note</Button>
            <Button kind="ghost" onClick={() => nav('/new', { state: { prefill: r.application } })}><PencilLine size={17} />Edit and re-check</Button>
            <Link to="/new"><Button kind="quiet"><Plus size={17} />New application</Button></Link>
          </div>
        </Card>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <Checks r={r} />
          <RiskCard r={r} />
          <Drivers drivers={r.drivers} />
          <Change r={r} busy={busy} onApply={() => r.counterfactual.loan_amount && recheck({ ...r.application, loan_amount: r.counterfactual.loan_amount, loan_term: r.counterfactual.loan_term || r.application.loan_term })} />
          <ReviewPanel key={r.id + (r.review ? 'r' : '')} r={r} onDone={setR} />
        </div>
        <div className="mt-4"><WhatIf key={r.id} r={r} busy={busy} onSave={recheck} /></div>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <ExplanationCard id={r.id} lang={lang} setLang={setLang} />
          <AskCase id={r.id} lang={lang} />
        </div>
        <p className="mt-4 text-center text-[13px] text-muted">Saved. Refreshing keeps this result. Model version {r.model_version}.</p>
      </div>
      <PrintNote r={r} />
    </>
  )
}
