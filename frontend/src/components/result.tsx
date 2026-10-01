import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, Circle, Clock, Volume2, VolumeX } from 'lucide-react'
import { api, ApiError } from '../lib/api'
import type { Explanation, Lang, Result, Simulation } from '../lib/types'
import { inr, pct, STAMP, when, WORD } from '../lib/format'
import { canSpeak, speak, stopSpeaking, useVoiceInput } from '../lib/speech'
import { Button, Card, CardTitle, CheckPill, cx, DecisionPill, FoirMeter, LangSwitch, MicButton, Notice, Skeleton, useDebounced } from './ui'

/* ---------- Status tracker (like order tracking in delivery apps) ---------- */
export function StatusTracker({ r }: { r: Result }) {
  const needsReview = r.decision === 'REFER' || Boolean(r.review)
  const steps = [
    { label: 'Submitted', sub: when(r.created_at), done: true },
    { label: 'Screened by Patrata', sub: `Recommended: ${WORD[r.decision].toLowerCase()}`, done: true },
    ...(needsReview ? [{ label: 'Credit manager review', sub: r.review ? `${r.review.reviewer}, ${when(r.review.created_at)}` : 'Waiting in the review queue', done: Boolean(r.review), current: !r.review }] : []),
    { label: 'Final decision', sub: r.review ? (r.review.final_decision === 'APPROVE' ? 'Approved' : 'Declined') : r.decision === 'REFER' ? 'Pending' : r.decision === 'APPROVE' ? 'Pre-approved, pending documents' : 'Declined by policy', done: r.decision !== 'REFER' || Boolean(r.review) },
  ]
  return (
    <ol className="grid gap-0 sm:grid-flow-col sm:auto-cols-fr" aria-label="Application status">
      {steps.map((s, i) => (
        <li key={s.label} className="relative flex gap-3 pb-4 sm:flex-col sm:gap-2 sm:pb-0 sm:pr-3">
          {i < steps.length - 1 && <span className={cx('absolute left-[13px] top-7 h-[calc(100%-20px)] w-0.5 sm:left-7 sm:top-[13px] sm:h-0.5 sm:w-[calc(100%-28px)]', s.done ? 'bg-ink' : 'bg-line')} aria-hidden="true" />}
          <span className={cx('relative z-10 grid h-7 w-7 shrink-0 place-items-center rounded-full border-2', s.done ? 'border-ink bg-ink text-white' : (s as any).current ? 'border-warn-ink bg-warn-bg text-warn' : 'border-line bg-white text-faint')}>
            {s.done ? <Check size={15} /> : (s as any).current ? <Clock size={14} /> : <Circle size={10} />}
          </span>
          <div>
            <p className="text-sm font-semibold">{s.label}</p>
            <p className="text-[13px] text-muted">{s.sub}</p>
          </div>
        </li>
      ))}
    </ol>
  )
}

/* ---------- Policy checks ---------- */
export function Checks({ r }: { r: Result }) {
  return (
    <Card>
      <CardTitle sub="The checks a credit officer would do by hand">Policy checks</CardTitle>
      <ul className="divide-y divide-line-2">
        {r.rule_checks.map((c) => (
          <li key={c.id} className="grid grid-cols-[auto_1fr_auto] items-center gap-3 py-3">
            <CheckPill s={c.status} />
            <div><p className="font-medium">{c.label}</p><p className="text-[13px] text-muted">{c.threshold}</p></div>
            <b className="text-right">{c.value}</b>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[13px] text-muted">New EMI estimated at {inr(r.emi_estimate)} a month at {r.application.annual_rate}% p.a.{r.application.existing_emi_monthly ? `, on top of ${inr(r.application.existing_emi_monthly)} in existing EMIs.` : '.'}</p>
    </Card>
  )
}

/* ---------- What moved the model (SHAP) ---------- */
export function Drivers({ drivers }: { drivers: Result['drivers'] }) {
  const max = Math.max(0.001, ...drivers.map((d) => Math.abs(d.impact)))
  return (
    <Card>
      <CardTitle right={<div className="flex gap-3 text-[12px] text-muted"><span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-against" />Against</span><span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-ink" />Supports</span></div>}
        sub="SHAP values for this one application">What moved the model</CardTitle>
      <div className="space-y-3">
        {drivers.map((d) => {
          const w = `${Math.max(3, (Math.abs(d.impact) / max) * 100)}%`
          const neg = d.direction === 'towards_decline'
          return (
            <div key={d.feature} className="grid grid-cols-[120px_1fr] items-center gap-3 sm:grid-cols-[150px_1fr]">
              <div><p className="text-sm font-medium">{d.label}</p><p className="text-[12px] text-muted">{d.value}</p></div>
              <div className="grid h-3.5 grid-cols-2" role="img" aria-label={`${d.label} ${neg ? 'weighs against approval' : 'supports approval'}`}>
                <div className="flex justify-end border-r border-faint">{neg && <i className="block h-full rounded-l bg-against" style={{ width: w }} />}</div>
                <div>{!neg && <i className="block h-full rounded-r bg-ink" style={{ width: w }} />}</div>
              </div>
            </div>
          )
        })}
      </div>
    </Card>
  )
}

/* ---------- Suggested change ---------- */
export function Change({ r, onApply, busy }: { r: Result; onApply: () => void; busy: boolean }) {
  const cf = r.counterfactual
  const a = r.application
  return (
    <Card>
      <CardTitle>{r.decision === 'APPROVE' ? 'Next step' : 'What would change the outcome'}</CardTitle>
      <p>{r.decision === 'APPROVE' ? 'Collect income documents and bank statements, then send the file for sign-off.' : cf.summary}</p>
      {r.decision !== 'APPROVE' && cf.possible && cf.loan_amount && (
        <>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-line p-3"><p className="text-[13px] text-muted">Requested</p><p className="font-semibold">{inr(a.loan_amount)} over {a.loan_term} years</p></div>
            <div className="rounded-xl border border-ink p-3"><p className="text-[13px] text-muted">Suggested</p><p className="font-semibold">{inr(cf.loan_amount)} over {cf.loan_term} years</p></div>
          </div>
          <Button kind="ghost" className="mt-4" onClick={onApply} disabled={busy}>{busy ? 'Checking…' : 'Check with this change'}</Button>
        </>
      )}
    </Card>
  )
}

/* ---------- What-if simulator ---------- */
export function WhatIf({ r, onSave, busy }: { r: Result; onSave: (a: Result['application']) => void; busy: boolean }) {
  const a = r.application
  const [amt, setAmt] = useState(a.loan_amount)
  const [term, setTerm] = useState(a.loan_term)
  const [cibil, setCibil] = useState(a.cibil_score)
  const [emi, setEmi] = useState(a.existing_emi_monthly)
  const q = useDebounced(JSON.stringify({ ...a, loan_amount: amt, loan_term: term, cibil_score: cibil, existing_emi_monthly: emi }), 250)
  const [sim, setSim] = useState<Simulation | null>(null)
  const [err, setErr] = useState('')
  useEffect(() => {
    const ctl = new AbortController()
    api<Simulation>('/simulate', { json: JSON.parse(q), signal: ctl.signal })
      .then((s) => { setSim(s); setErr('') })
      .catch((e) => { if (e.name !== 'AbortError') setErr(e instanceof ApiError && e.body?.errors ? e.body.errors[0].message : 'Simulation unavailable') })
    return () => ctl.abort()
  }, [q])
  const changed = amt !== a.loan_amount || term !== a.loan_term || cibil !== a.cibil_score || emi !== a.existing_emi_monthly
  const maxEmi = Math.round(a.income_annum / 12 * 0.8 / 500) * 500
  const slider = (label: string, value: number, set: (n: number) => void, min: number, max: number, stepN: number, fmt: (n: number) => string) => (
    <label className="block">
      <span className="mb-1 flex justify-between text-sm"><span className="text-muted">{label}</span><b>{fmt(value)}</b></span>
      <input type="range" className="w-full" min={min} max={max} step={stepN} value={value} onChange={(e) => set(Number(e.target.value))} />
    </label>
  )
  return (
    <Card>
      <CardTitle sub="Move the sliders to see how the decision would change. Nothing is saved until you choose.">What-if simulator</CardTitle>
      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-4">
          {slider('Loan amount', amt, setAmt, Math.round(a.loan_amount * 0.3 / 10000) * 10000, Math.round(a.loan_amount * 1.5 / 10000) * 10000, 10000, inr)}
          {slider('Term', term, setTerm, 2, 20, 1, (n) => `${n} years`)}
          {slider('CIBIL score', cibil, setCibil, 300, 900, 5, String)}
          {slider('Existing EMIs', emi, setEmi, 0, Math.max(maxEmi, a.existing_emi_monthly), 500, inr)}
        </div>
        <div className="rounded-2xl bg-paper p-4" aria-live="polite">
          {err ? <Notice tone="bad">{err}</Notice> : !sim ? <Skeleton className="h-24" /> : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div><p className="text-sm text-muted">Would be</p><p className="text-lg font-semibold">{WORD[sim.decision]}</p></div>
                <DecisionPill d={sim.decision} />
              </div>
              <p className="text-sm">Model likelihood <b>{pct(sim.approval_probability)}</b>, new EMI <b>{inr(sim.emi_estimate)}</b></p>
              <FoirMeter foir={sim.foir} />
              <div className="flex flex-wrap gap-2">
                <Button kind="ghost" disabled={!changed || busy} onClick={() => onSave({ ...a, loan_amount: amt, loan_term: term, cibil_score: cibil, existing_emi_monthly: emi })}>Save as a new check</Button>
                <Button kind="quiet" disabled={!changed} onClick={() => { setAmt(a.loan_amount); setTerm(a.loan_term); setCibil(a.cibil_score); setEmi(a.existing_emi_monthly) }}>Reset</Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </Card>
  )
}

/* ---------- Explanation (LLM, EN/HI, read aloud) ---------- */
export function ExplanationCard({ id, lang, setLang }: { id: string; lang: Lang; setLang: (l: Lang) => void }) {
  const [data, setData] = useState<Record<string, Explanation | 'error'>>({})
  const [speaking, setSpeaking] = useState(false)
  useEffect(() => {
    if (data[lang]) return
    api<Explanation>(`/applications/${id}/explain?lang=${lang}`, { method: 'POST' })
      .then((e) => setData((p) => ({ ...p, [lang]: e })))
      .catch(() => setData((p) => ({ ...p, [lang]: 'error' })))
  }, [id, lang])
  useEffect(() => () => stopSpeaking(), [])
  const e = data[lang]
  const text = e && e !== 'error' ? [e.summary, ...e.reasons, e.next_steps].join(' ') : ''
  return (
    <Card>
      <CardTitle right={<div className="flex gap-2">
        {canSpeak() && e && e !== 'error' && (
          <button type="button" aria-label={speaking ? 'Stop reading' : 'Read aloud'} onClick={() => { if (speaking) { stopSpeaking(); setSpeaking(false) } else { setSpeaking(true); speak(text, lang, () => setSpeaking(false)) } }}
            className="grid h-9 w-9 place-items-center rounded-lg border border-field hover:border-ink">{speaking ? <VolumeX size={17} /> : <Volume2 size={17} />}</button>
        )}
        <LangSwitch lang={lang} onChange={(l) => { stopSpeaking(); setSpeaking(false); setLang(l) }} />
      </div>}>In plain language</CardTitle>
      {!e ? <div className="space-y-2"><Skeleton /><Skeleton className="h-4 w-4/5" /><Skeleton className="h-4 w-3/5" /></div>
        : e === 'error' ? <p className="text-muted">The explanation couldn't load. The decision above is unaffected.</p> : (
          <div className="space-y-3" lang={lang}>
            <p className="font-medium">{e.summary}</p>
            <ul className="list-disc space-y-1.5 pl-5">{e.reasons.map((x, i) => <li key={i}>{x}</li>)}</ul>
            {e.next_steps && <p>{e.next_steps}</p>}
            <p className="text-[13px] text-muted" lang="en">{e.source === 'llm'
              ? 'Written by the AI model from the figures on this page. Every number is checked against the calculation before it is shown.'
              : 'Standard explanation generated from the calculation, because the AI explanation is not available right now.'}</p>
          </div>
        )}
    </Card>
  )
}

/* ---------- Questions about this case (guarded) ---------- */
export function AskCase({ id, lang }: { id: string; lang: Lang }) {
  const [msgs, setMsgs] = useState<{ me: boolean; text: string }[]>([])
  const [q, setQ] = useState('')
  const [wait, setWait] = useState(false)
  const send = useCallback(async (text: string) => {
    text = text.trim(); if (text.length < 2 || wait) return
    setQ(''); setMsgs((m) => [...m, { me: true, text }]); setWait(true)
    try {
      const r = await api<{ answer: string }>(`/applications/${id}/ask`, { json: { question: text, language: lang } })
      setMsgs((m) => [...m, { me: false, text: r.answer }])
    } catch { setMsgs((m) => [...m, { me: false, text: "Couldn't get an answer right now. Try again in a moment." }]) }
    finally { setWait(false) }
  }, [id, lang, wait])
  const voice = useVoiceInput(lang, send)
  const end = useRef<HTMLDivElement>(null)
  useEffect(() => { end.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }) }, [msgs])
  return (
    <Card>
      <CardTitle sub="Answers come only from this application's figures">Ask about this decision</CardTitle>
      <div className="mb-3 flex flex-wrap gap-2">
        {['Why this result?', 'What would improve the chances?', 'Can you just approve it?'].map((t) => (
          <button key={t} type="button" onClick={() => send(t)} className="min-h-9 rounded-full border border-field px-3 text-[13px] hover:border-ink">{t}</button>
        ))}
      </div>
      <div className="flex max-h-72 flex-col gap-2 overflow-y-auto">
        {msgs.map((m, i) => (
          <div key={i} className={cx('max-w-[85%] rounded-2xl px-4 py-2.5 text-sm', m.me ? 'self-end rounded-br-md bg-sky' : 'self-start rounded-bl-md border border-line')}>{m.text}</div>
        ))}
        {wait && <div className="self-start"><Skeleton className="h-9 w-40" /></div>}
        <div ref={end} />
      </div>
      <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); send(q) }}>
        <label htmlFor="askq" className="sr-only">Your question</label>
        <input id="askq" value={voice.listening ? voice.interim || 'Listening…' : q} onChange={(e) => setQ(e.target.value)} placeholder="Ask why, or what would help"
          className="h-11 min-w-0 flex-1 rounded-xl border border-field px-3 outline-none focus:border-ink" />
        <MicButton supported={voice.supported} listening={voice.listening} onStart={voice.start} onStop={voice.stop} />
        <Button type="submit" disabled={wait}>Ask</Button>
      </form>
    </Card>
  )
}

/* ---------- Human review (credit manager) ---------- */
export function ReviewPanel({ r, onDone }: { r: Result; onDone: (r: Result) => void }) {
  const [open, setOpen] = useState(r.decision === 'REFER')
  const [final, setFinal] = useState<'APPROVE' | 'DECLINE' | ''>('')
  const [note, setNote] = useState('')
  const [who, setWho] = useState(() => localStorage.getItem('patrata-reviewer') || '')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  if (r.review) {
    const rv = r.review
    return (
      <Card>
        <CardTitle sub={`${rv.reviewer}, ${when(rv.created_at)}`}>Credit manager's decision</CardTitle>
        <div className="flex items-center gap-3"><DecisionPill d={rv.final_decision} label={rv.final_decision === 'APPROVE' ? 'Approved' : 'Declined'} />
          {rv.final_decision !== r.decision && r.decision !== 'REFER' && <span className="text-[13px] font-medium text-warn">Overrides Patrata's recommendation</span>}</div>
        <p className="mt-3 rounded-xl bg-paper p-3">“{rv.note}”</p>
      </Card>
    )
  }
  if (!open) return (
    <Card>
      <CardTitle sub="A credit manager can override the recommendation, with a written reason that is kept in the audit trail.">Override</CardTitle>
      <Button kind="ghost" onClick={() => setOpen(true)}>Record a different decision</Button>
    </Card>
  )
  async function save() {
    if (!final) return setErr('Choose approve or decline.')
    if (note.trim().length < 10) return setErr('Write a reason of at least 10 characters. It goes into the audit trail.')
    setBusy(true); setErr('')
    try {
      if (who.trim()) localStorage.setItem('patrata-reviewer', who.trim())
      onDone(await api<Result>(`/applications/${r.id}/review`, { json: { final_decision: final, note, reviewer: who.trim() || 'Credit manager' } }))
    } catch { setErr("Couldn't save the decision. Try again.") } finally { setBusy(false) }
  }
  return (
    <Card>
      <CardTitle sub="Patrata recommends; a person decides. Your reason is stored with your name and the time.">{r.decision === 'REFER' ? 'Credit manager review' : 'Override'}</CardTitle>
      <fieldset className="mb-3 flex gap-2">
        <legend className="sr-only">Final decision</legend>
        {(['APPROVE', 'DECLINE'] as const).map((d) => (
          <label key={d} className={cx('flex min-h-11 flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl border font-semibold', final === d ? (d === 'APPROVE' ? 'border-ok bg-ok-bg text-ok' : 'border-bad bg-bad-bg text-bad') : 'border-field')}>
            <input type="radio" name="final" className="sr-only" checked={final === d} onChange={() => setFinal(d)} />{d === 'APPROVE' ? 'Approve' : 'Decline'}
          </label>
        ))}
      </fieldset>
      <label htmlFor="note" className="text-[13px] text-muted">Reason</label>
      <textarea id="note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="For example: salary slips verified, co-applicant income added"
        className="mt-1 w-full rounded-xl border border-field p-3 outline-none focus:border-ink" />
      <label htmlFor="who" className="mt-2 block text-[13px] text-muted">Your name</label>
      <input id="who" value={who} onChange={(e) => setWho(e.target.value)} placeholder="Credit manager" className="mt-1 h-11 w-full rounded-xl border border-field px-3 outline-none focus:border-ink" />
      {err && <p className="mt-2 text-sm text-bad">{err}</p>}
      <Button className="mt-4 w-full" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Record final decision'}</Button>
    </Card>
  )
}

/* ---------- Printable decision note (Download PDF uses the browser's Save as PDF) ---------- */
export function PrintNote({ r }: { r: Result }) {
  const a = r.application
  const rows: [string, string][] = [
    ['Age', `${a.age} years`], ['Dependents', String(a.no_of_dependents)], ['Annual income', inr(a.income_annum)],
    ['Existing EMIs', `${inr(a.existing_emi_monthly)} a month`], ['Loan requested', `${inr(a.loan_amount)} over ${a.loan_term} years at ${a.annual_rate}% p.a.`],
    ['Employment', `${r.repayment_risk?.employment || a.employment_type}, ${a.years_in_job} years`],
    ['CIBIL score', String(a.cibil_score)], ['Assets', inr(a.residential_assets_value + a.commercial_assets_value + a.luxury_assets_value + a.bank_asset_value)],
    ['Estimated new EMI', inr(r.emi_estimate)], ['EMI burden (FOIR)', `${(r.foir * 100).toFixed(1)}%`], ['Model approval likelihood', pct(r.approval_probability)],
    ['Repayment risk (307,511 real loans)', r.repayment_risk ? `${(r.repayment_risk.probability * 100).toFixed(1)}% (${r.repayment_risk.band})` : 'n/a'],
  ]
  return (
    <div className="print-only text-[12pt] text-black">
      <div className="flex items-start justify-between border-b-2 border-black pb-3">
        <div><p className="text-[18pt] font-bold">Loan pre-screening note</p><p>Patrata decision support. Application {r.id}. {when(r.created_at)}.</p></div>
        <div className="stamp text-[18pt]">{STAMP[r.decision]}</div>
      </div>
      <p className="mt-4 text-[14pt] font-semibold">Recommendation: {WORD[r.decision]}</p>
      <p>Status: {r.status}</p>
      <table className="mt-4 w-full border-collapse">
        <tbody>{rows.map(([k, v]) => <tr key={k}><td className="w-1/2 border-b border-gray-300 py-1.5">{k}</td><td className="border-b border-gray-300 py-1.5 font-semibold">{v}</td></tr>)}</tbody>
      </table>
      <p className="mt-4 font-semibold">Policy checks</p>
      <ul className="list-disc pl-6">{r.rule_checks.map((c) => <li key={c.id}>{c.label}: {c.value} ({c.status === 'pass' ? 'pass' : c.status === 'refer' ? 'review' : 'fail'}; {c.threshold})</li>)}</ul>
      <p className="mt-3 font-semibold">Reasons</p>
      <ul className="list-disc pl-6">{r.reasons.map((x, i) => <li key={i}>{x}</li>)}</ul>
      <p className="mt-3"><b>Suggested change:</b> {r.counterfactual.summary}</p>
      {r.review && <p className="mt-3"><b>Credit manager:</b> {r.review.final_decision === 'APPROVE' ? 'Approved' : 'Declined'} by {r.review.reviewer}, {when(r.review.created_at)}. “{r.review.note}”</p>}
      <div className="mt-12 grid grid-cols-2 gap-10"><p className="border-t border-black pt-1">Loan officer</p><p className="border-t border-black pt-1">Credit manager</p></div>
      <p className="mt-6 text-[9pt]">Model version {r.model_version}. Decision support only; the lender remains responsible for the credit decision. No personal identifiers were collected.</p>
    </div>
  )
}

/* ---------- Repayment risk (second model, 307,511 real loans) ---------- */
export function RiskCard({ r }: { r: Result }) {
  const k = r.repayment_risk
  if (!k || k.probability == null) return null
  const tone = k.band === 'high' ? 'text-bad' : k.band === 'low' ? 'text-ok' : 'text-warn'
  const max = Math.max(0.001, ...k.drivers.map((d) => Math.abs(d.impact)))
  const scale = Math.max(0.25, k.probability * 1.4, k.base_rate * 2)
  return (
    <Card>
      <CardTitle sub="Learned from 307,511 real loans (Home Credit). It informs the decision but never declines on its own.">Repayment risk</CardTitle>
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className={cx('text-[28px] font-semibold leading-none', tone)}>{(k.probability * 100).toFixed(1)}%</p>
          <p className="mt-1 text-sm text-muted">chance of payment difficulties</p>
        </div>
        <div className="text-right">
          <p className={cx('text-lg font-semibold capitalize', tone)}>{k.band} risk</p>
          <p className="text-sm text-muted">{k.relative.toFixed(1)}× the average borrower</p>
        </div>
      </div>
      <div className="relative mt-4 h-3 rounded-full bg-line-2" role="img" aria-label={`Risk ${(k.probability * 100).toFixed(1)} percent, average ${(k.base_rate * 100).toFixed(1)} percent`}>
        <div className={cx('h-3 rounded-full', k.band === 'high' ? 'bg-bad' : k.band === 'low' ? 'bg-ok' : 'bg-warn-ink')} style={{ width: `${Math.min(100, (k.probability / scale) * 100)}%` }} />
        <div className="absolute -top-1 h-5 w-0.5 bg-ink" style={{ left: `${(k.base_rate / scale) * 100}%` }} />
      </div>
      <p className="mt-1 text-[12px] text-muted" style={{ paddingLeft: `calc(${(k.base_rate / scale) * 100}% - 34px)` }}>Average {(k.base_rate * 100).toFixed(1)}%</p>
      <p className="mb-2 mt-4 text-sm font-medium">What drives it</p>
      <ul className="space-y-2">
        {k.drivers.map((d) => (
          <li key={d.feature} className="grid grid-cols-[1fr_auto] items-center gap-3 text-sm">
            <span>{d.label} <span className="text-muted">({d.value})</span></span>
            <span className={cx('flex items-center gap-2 text-[13px]', d.direction === 'raises_risk' ? 'text-bad' : 'text-ok')}>
              <i className={cx('block h-2 rounded-full', d.direction === 'raises_risk' ? 'bg-bad' : 'bg-ok')} style={{ width: `${Math.max(8, (Math.abs(d.impact) / max) * 70)}px` }} />
              {d.direction === 'raises_risk' ? 'Raises' : 'Lowers'}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  )
}
