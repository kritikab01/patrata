import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Bot, MessageCircle, PencilLine, Plus, ReceiptText, SlidersHorizontal } from 'lucide-react'
import { api, newRequestId } from '../lib/api'
import type { Application, Lang, Result } from '../lib/types'
import { inr, pct, when, WORD } from '../lib/format'
import { AskCase, Change, Checks, Drivers, ExplanationCard, ReviewPanel, RiskCard, StatusTracker, WhatIf } from '../components/result'
import { SlipBody, SlipModal, useKfs } from '../components/slip'
import { Button, Card, cx, Notice, SampleBadge, Skeleton, StatusIcon, StatusPill } from '../components/ui'

const go = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })

export default function CaseDetail() {
  const { id = '' } = useParams()
  const nav = useNavigate()
  const { state } = useLocation() as { state?: { result?: Result } }
  const [r, setR] = useState<Result | null>(state?.result?.id === id ? state.result : null)
  const [missing, setMissing] = useState(false)
  const [lang, setLang] = useState<Lang>('en')
  const [busy, setBusy] = useState(false)
  const [slip, setSlip] = useState(false)
  const kfs = useKfs(id, Boolean(r))

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
      <p className="font-display text-lg font-extrabold">This application isn't available</p>
      <p className="mt-1 text-muted">It may have been cleared when the server restarted.</p>
      <Link to="/new"><Button className="mt-4">Start a new check</Button></Link>
    </Card>
  )
  if (!r) return <div className="space-y-4"><Skeleton className="h-48 w-full rounded-[14px]" /><Skeleton className="h-64 w-full rounded-[14px]" /></div>

  const conflict = r.flags.includes('model_policy_conflict')
  const ood = r.flags.includes('outside_training_range')
  const soft = r.rule_checks.filter((c) => c.status !== 'pass')
  const cf = r.counterfactual
  const offer = r.decision !== 'APPROVE' && cf.possible && cf.loan_amount ? cf : null
  const reasonLine = r.decision === 'APPROVE' ? 'All policy checks pass.'
    : soft.length ? `${soft.map((c) => c.label).join(' and ')} ${soft.length > 1 ? 'need' : 'needs'} attention.` : r.reasons[0]
  const metrics: [string, string, string?][] = [
    ['EMI burden', `${(r.foir * 100).toFixed(1)}%`, r.foir > 0.65 ? 'text-bad' : r.foir > 0.5 ? 'text-warn' : ''],
    ['Approval model', r.approval_probability == null ? 'Not scored' : pct(r.approval_probability)],
    ['Default risk', r.repayment_risk ? `${(r.repayment_risk.probability * 100).toFixed(1)}%` : 'n/a', r.repayment_risk?.band === 'high' ? 'text-bad' : ''],
  ]
  const actions = [
    { label: 'Review agent', icon: Bot, on: () => go('review') },
    { label: 'What-if', icon: SlidersHorizontal, on: () => go('whatif') },
    { label: 'Decision slip', icon: ReceiptText, on: () => setSlip(true) },
    { label: 'Ask AI', icon: MessageCircle, on: () => go('ask') },
  ]

  return (
    <>
      <div className="no-print">
        <Link to="/cases" className="mb-4 inline-flex min-h-10 items-center gap-1.5 text-sm text-muted hover:text-ink"><ArrowLeft size={16} />Applications</Link>

        <section className="overflow-hidden rounded-[14px] border border-ink bg-white">
          {/* Vault: the decision as a black slab, with a UPI-style status icon */}
          <div className="bg-ink px-5 py-6 text-white sm:px-7">
            <div className="flex items-start gap-4">
              <StatusIcon d={r.decision} size={52} />
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 text-[13px] text-zinc-300">Recommendation, application {r.id}, {when(r.created_at)} {r.sample && <span className="rounded border border-zinc-600 px-1.5 text-[11px]">Sample</span>}</p>
                <h1 className="mt-1 text-[28px] font-extrabold leading-[1.05] sm:text-[36px]">{WORD[r.decision]}</h1>
                <p className="mt-2 text-zinc-200">{reasonLine}</p>
              </div>
            </div>
          </div>
          {/* Vault: ruled metrics strip */}
          <div className="grid grid-cols-3 divide-x divide-line border-b border-line">
            {metrics.map(([k, v, tone]) => (
              <div key={k} className="px-4 py-3 sm:px-6">
                <p className="text-[12px] text-muted">{k}</p>
                <p className={cx('font-display text-[22px] font-extrabold tabular-nums sm:text-[26px]', tone)}>{v}</p>
              </div>
            ))}
          </div>
          <div className="space-y-3 p-5 sm:p-6">
            <div className="flex flex-wrap items-center gap-2"><StatusPill status={r.status} />{r.sample && <SampleBadge />}</div>
            {r.approval_probability == null && <Notice tone="info" title="First-time borrower.">No CIBIL score, so the approval model isn't used. The repayment-risk model still runs, and a credit officer checks income and bank statements.</Notice>}
            {conflict && <Notice title="The model and the policy disagree.">{r.reasons[r.reasons.length - 1]}</Notice>}
            {ood && <Notice tone="info">{r.reasons.find((x) => x.startsWith('These inputs')) || 'These inputs are outside the training data.'}</Notice>}
            {r.warnings.map((w) => <Notice key={w}>{w}</Notice>)}
            <div className="border-t border-line-2 pt-4"><StatusTracker r={r} /></div>
          </div>
        </section>

        {/* UPI Blue: the approvable offer */}
        {offer && (
          <section className="mt-4 rounded-[20px] border-2 border-brand bg-white p-5 sm:p-6">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-[13px] font-semibold text-ok">Approvable offer</p>
                <p className="font-display text-[30px] font-extrabold leading-tight tabular-nums">{inr(offer.loan_amount)}</p>
                <p className="text-muted">{offer.loan_term} years, clears every policy check</p>
              </div>
              <Button disabled={busy} onClick={() => recheck({ ...r.application, loan_amount: offer.loan_amount!, loan_term: offer.loan_term || r.application.loan_term })}>
                {busy ? 'Checking…' : 'Check with this amount'}
              </Button>
            </div>
          </section>
        )}

        {/* UPI Blue: quick actions */}
        <nav aria-label="Quick actions" className="mt-4 grid grid-cols-4 gap-2 sm:gap-3">
          {actions.map(({ label, icon: Icon, on }) => (
            <button key={label} type="button" onClick={on} className="flex min-h-[84px] flex-col items-center justify-center gap-2 rounded-[14px] border border-line bg-white text-[12px] font-medium hover:border-brand sm:text-[13px]">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-bg text-brand"><Icon size={20} aria-hidden="true" /></span>
              {label}
            </button>
          ))}
        </nav>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <Checks r={r} />
          <RiskCard r={r} />
          {r.drivers.length > 0 && <Drivers drivers={r.drivers} />}
          {!offer && <Change r={r} busy={busy} onApply={() => cf.loan_amount && recheck({ ...r.application, loan_amount: cf.loan_amount, loan_term: cf.loan_term || r.application.loan_term })} />}
          <div id="review" className="scroll-mt-24"><ReviewPanel key={r.id + (r.review ? 'r' : '')} r={r} onDone={setR} /></div>
        </div>
        <div id="whatif" className="mt-4 scroll-mt-24"><WhatIf key={r.id} r={r} busy={busy} onSave={recheck} /></div>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <ExplanationCard id={r.id} lang={lang} setLang={setLang} />
          <div id="ask" className="scroll-mt-24"><AskCase id={r.id} lang={lang} /></div>
        </div>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <Button kind="ghost" onClick={() => nav('/new', { state: { prefill: r.application } })}><PencilLine size={17} />Edit and re-check</Button>
          <Link to="/new"><Button kind="quiet"><Plus size={17} />New application</Button></Link>
        </div>
        <p className="mt-4 text-center text-[13px] text-muted">Saved. Refreshing keeps this result. Model version {r.model_version}.</p>
      </div>
      {slip && <SlipModal r={r} kfs={kfs} onClose={() => setSlip(false)} />}
      <div className="print-only"><SlipBody r={r} kfs={kfs} /></div>
    </>
  )
}
