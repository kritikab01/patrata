import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Lock, Sparkles } from 'lucide-react'
import { api, ApiError, newRequestId } from '../lib/api'
import { BASE, EXAMPLES, FIELDS, STEPS, type FieldDef } from '../lib/fields'
import type { Application, Result, Simulation } from '../lib/types'
import { inr, inrShort, pct, WORD } from '../lib/format'
import { Button, Card, CibilMeter, cx, DecisionPill, FoirMeter, Notice, PageHead, Skeleton, useDebounced } from '../components/ui'

type Form = Record<keyof Application, string>
const toForm = (a: Partial<Application>): Form =>
  Object.fromEntries(FIELDS.map((f) => [f.id, a[f.id] == null ? '' : String(a[f.id])])) as Form
const num = (v: string) => (v.trim() === '' ? null : Number(v.replace(/,/g, '')))
const val = (f: FieldDef, v: string) => (f.kind === 'select' ? v : num(v))
const pretty = (f: FieldDef, raw: string) =>
  f.kind === 'inr' && raw !== '' ? new Intl.NumberFormat('en-IN').format(Number(raw)) : raw

function load(): Form {
  try { const d = localStorage.getItem('patrata-draft'); if (d) return JSON.parse(d) } catch { /* ignore */ }
  return toForm(BASE)
}

export default function NewApplication() {
  const nav = useNavigate()
  const { state } = useLocation() as { state?: { prefill?: Application; submit?: boolean } }
  const [form, setForm] = useState<Form>(() => (state?.prefill ? toForm(state.prefill) : load()))
  const [step, setStep] = useState(0)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState('')
  const [busy, setBusy] = useState(false)
  const [slow, setSlow] = useState(false)
  const last = useRef<{ key: string; req: string } | null>(null)

  useEffect(() => { try { localStorage.setItem('patrata-draft', JSON.stringify(form)) } catch { /* ignore */ } }, [form])

  const values = useMemo(() => {
    const o: Record<string, number | null> = {}
    FIELDS.forEach((f) => { o[f.id] = f.kind === 'select' ? 0 : num(form[f.id]) })
    return o
  }, [form])
  const complete = FIELDS.every((f) => values[f.id] !== null && !Number.isNaN(values[f.id]))

  // Live preview: same pipeline via /simulate (nothing saved), debounced while typing.
  const payloadOf = (src: Form) => Object.fromEntries(FIELDS.map((f) => [f.id, val(f, src[f.id])]))
  const debounced = useDebounced(complete ? JSON.stringify(payloadOf(form)) : '', 400)
  const [sim, setSim] = useState<Simulation | null>(null)
  const [simErr, setSimErr] = useState('')
  useEffect(() => {
    if (!debounced) { setSim(null); return }
    const ctl = new AbortController()
    api<Simulation>('/simulate', { json: JSON.parse(debounced), signal: ctl.signal })
      .then((r) => { setSim(r); setSimErr('') })
      .catch((e) => { if (e.name !== 'AbortError') { setSim(null); setSimErr(e instanceof ApiError && e.body?.errors ? e.body.errors[0].message : '') } })
    return () => ctl.abort()
  }, [debounced])

  const set = (f: FieldDef, raw: string) => {
    const clean = f.kind === 'dec' ? raw.replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1') : raw.replace(/[^\d]/g, '')
    setForm((p) => ({ ...p, [f.id]: clean }))
    setErrors((p) => { const n = { ...p }; delete n[f.id]; return n })
    setFormError('')
  }

  const stepValid = (i: number) => {
    const miss: Record<string, string> = {}
    FIELDS.filter((f) => f.step === i).forEach((f) => { if (values[f.id] === null) miss[f.id] = 'Required' })
    setErrors((p) => ({ ...p, ...miss }))
    return !Object.keys(miss).length
  }

  async function submit(data?: Form) {
    if (busy) return                                   // blocks double clicks
    const src = data || form
    const payload = payloadOf(src)
    if (!data) for (let i = 0; i < STEPS.length; i++) if (!stepValid(i)) { setStep(i); return }
    const key = JSON.stringify(payload)
    if (!last.current) { try { last.current = JSON.parse(localStorage.getItem('patrata-last') || 'null') } catch { /* ignore */ } }
    if (!last.current || last.current.key !== key) last.current = { key, req: newRequestId() }   // same data = same request id
    try { localStorage.setItem('patrata-last', JSON.stringify(last.current)) } catch { /* ignore */ }
    setBusy(true)
    const t = setTimeout(() => setSlow(true), 4000)
    try {
      const r = await api<Result>('/score', { json: { ...payload, request_id: last.current.req } })
      nav(`/cases/${r.id}`, { state: { result: r } })
    } catch (e) {
      if (e instanceof ApiError && e.status === 422 && e.body?.errors) {
        const errs: Record<string, string> = {}
        let first: number | null = null
        e.body.errors.forEach((x: { field: string; message: string }) => {
          const f = FIELDS.find((ff) => ff.id === x.field)
          if (f) { errs[f.id] = x.message; if (first === null) first = f.step } else setFormError(x.message)
        })
        setErrors(errs)
        if (first !== null) setStep(first)
      } else setFormError("Couldn't reach the server. Check your connection and try again.")
    } finally { clearTimeout(t); setSlow(false); setBusy(false) }
  }

  useEffect(() => { if (state?.prefill && state.submit) submit(toForm(state.prefill)) }, [])   // "check with this change"

  return (
    <>
      <PageHead title="New application" sub="Enter figures from the applicant's documents. You'll get Approve, Refer or Decline with the reasons in seconds." />

      <div className="mb-5">
        <p className="mb-2 flex items-center gap-1.5 text-sm text-muted"><Sparkles size={15} aria-hidden="true" />Try an example</p>
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
          {EXAMPLES.map((e) => (
            <button key={e.name} type="button" disabled={busy}
              onClick={() => { const f = toForm(e.data); setForm(f); setErrors({}); setStep(2); submit(f) }}
              className="min-h-12 shrink-0 rounded-2xl border border-field bg-white px-4 py-2 text-left hover:border-ink">
              <span className="block text-sm font-semibold">{e.name}</span>
              <span className="block text-[12px] text-muted">{e.note}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-[1.25fr_1fr]">
        <Card as="form" noValidate onSubmit={(e: React.FormEvent) => { e.preventDefault(); if (stepValid(step)) step < 2 ? setStep(step + 1) : submit() }}>
          <div className="mb-5">
            <div className="flex gap-1.5" aria-hidden="true">
              {STEPS.map((_, i) => <span key={i} className={cx('h-1.5 flex-1 rounded-full', i <= step ? 'bg-ink' : 'bg-line-2')} />)}
            </div>
            <div className="mt-3 flex flex-wrap gap-2" role="tablist" aria-label="Form steps">
              {STEPS.map((s, i) => (
                <button key={s} type="button" role="tab" aria-selected={i === step} onClick={() => setStep(i)}
                  className={cx('rounded-full px-3 py-1 text-[13px]', i === step ? 'bg-ink text-white' : 'bg-paper text-muted hover:text-ink')}>
                  {i + 1}. {s}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-x-3 gap-y-4 sm:grid-cols-2">
            {FIELDS.filter((f) => f.step === step).map((f) => (
              <div key={f.id} className={cx('flex min-w-0 flex-col gap-1.5', f.wide && 'sm:col-span-2')}>
                <label htmlFor={f.id} className="text-[13px] text-muted">{f.label}</label>
                {f.kind === 'select' ? (
                  <select id={f.id} value={form[f.id]} onChange={(e) => setForm((p) => ({ ...p, [f.id]: e.target.value }))}
                    className="h-12 w-full rounded-xl border border-field bg-white px-3 text-base outline-none focus:border-ink">
                    {f.options!.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                ) : (
                <div className="relative flex items-center">
                  {f.kind === 'inr' && <span className="pointer-events-none absolute left-3 text-muted" aria-hidden="true">₹</span>}
                  <input id={f.id} inputMode={f.kind === 'dec' ? 'decimal' : 'numeric'} autoComplete="off"
                    value={pretty(f, form[f.id])} onChange={(e) => set(f, e.target.value)}
                    aria-invalid={Boolean(errors[f.id])} aria-describedby={`${f.id}-h`}
                    className={cx('h-12 w-full rounded-xl border bg-white text-base outline-none focus:border-ink', f.kind === 'inr' ? 'pl-7 pr-3' : 'px-3', f.suffix && 'pr-16',
                      errors[f.id] ? 'border-bad bg-[#FFFBFA]' : 'border-field')} />
                  {f.suffix && <span className="pointer-events-none absolute right-3 text-sm text-muted" aria-hidden="true">{f.suffix}</span>}
                </div>
                )}
                <span id={`${f.id}-h`} className={cx('min-h-[18px] text-[12px]', errors[f.id] ? 'text-bad' : 'text-muted')}>
                  {errors[f.id] || (f.kind === 'inr' && values[f.id] ? `${inrShort(values[f.id]!)}${f.hint ? '. ' + f.hint : ''}` : f.hint) || ''}
                </span>
              </div>
            ))}
          </div>

          {formError && <div className="mt-2"><Notice tone="bad">{formError}</Notice></div>}
          {slow && <p className="mt-3 text-center text-sm text-warn" role="status">Waking up the server. The first check after a quiet spell can take up to a minute.</p>}

          <div className="mt-5 flex gap-2">
            {step > 0 && <Button type="button" kind="ghost" onClick={() => setStep(step - 1)}>Back</Button>}
            <Button type="submit" className="flex-1" disabled={busy}>{busy ? 'Checking…' : step < 2 ? 'Next' : 'Check eligibility'}</Button>
          </div>
          <p className="mt-4 flex gap-2 rounded-xl bg-paper px-3 py-2.5 text-[13px] text-muted">
            <Lock size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
            No name, PAN, Aadhaar or phone number is collected. Only calculated figures are sent to the AI model that writes explanations.
          </p>
        </Card>

        <Card className="lg:sticky lg:top-8" aria-live="polite">
          <p className="text-sm text-muted">Live preview</p>
          <h2 className="mb-4 text-[17px] font-semibold">How this application looks so far</h2>
          {!complete ? (
            <p className="text-muted">Fill in every field and the preview updates as you type. Nothing is saved until you check eligibility.</p>
          ) : !sim ? (
            simErr ? <Notice tone="bad">{simErr}</Notice> : <div className="space-y-3"><Skeleton className="h-6 w-2/3" /><Skeleton className="h-3" /><Skeleton className="h-3" /></div>
          ) : (
            <div className="space-y-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm text-muted">Likely outcome</p>
                  <p className="text-xl font-semibold">{WORD[sim.decision]}</p>
                </div>
                <DecisionPill d={sim.decision} />
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-xl bg-paper p-3"><p className="text-muted">New EMI</p><p className="text-lg font-semibold">{inr(sim.emi_estimate)}</p></div>
                <div className="rounded-xl bg-paper p-3"><p className="text-muted">Model likelihood</p><p className="text-lg font-semibold">{pct(sim.approval_probability)}</p></div>
              </div>
              <FoirMeter foir={sim.foir} />
              {values.cibil_score != null && <CibilMeter score={values.cibil_score} />}
              {(() => { const c = sim.rule_checks.find((x) => x.id === 'repayment'); return c && (
                <div className="flex items-center justify-between rounded-xl bg-paper p-3 text-sm"><span className="text-muted">Repayment risk (307,511 real loans)</span>
                  <b className={c.status === 'pass' ? 'text-ok' : 'text-warn'}>{c.value}</b></div>) })()}
              {sim.flags.includes('outside_training_range') && <Notice tone="info">This applicant is outside the model's training data, so a human will review it.</Notice>}
            </div>
          )}
        </Card>
      </div>
    </>
  )
}
