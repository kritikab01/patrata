import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { BookOpen, Car, Home, Lock, Smartphone, Sparkles, Wallet } from 'lucide-react'
import { api, ApiError, newRequestId } from '../lib/api'
import { BASE, EXAMPLES, FIELDS, STEPS, type FieldDef } from '../lib/fields'
import { criteriaLines, findVariant, needsPrice, needsProperty, usesMonths, useBook, type Variant } from '../lib/products'
import type { Application, Result, Simulation } from '../lib/types'
import { inr, inrShort, pct, WORD } from '../lib/format'
import { Button, Card, CibilMeter, cx, DecisionPill, FoirMeter, Notice, PageHead, Skeleton, useDebounced } from '../components/ui'

type Form = Record<keyof Application, string>
const toForm = (a: Partial<Application>): Form =>
  Object.fromEntries(FIELDS.map((f) => [f.id, a[f.id] == null ? '' : String(a[f.id])])) as Form
const num = (v?: string | null) => (v == null || String(v).trim() === '' ? null : Number(String(v).replace(/,/g, '')))
const pretty = (f: FieldDef, raw: string) => (f.kind === 'inr' && raw !== '' ? new Intl.NumberFormat('en-IN').format(Number(raw)) : raw)
const PRODUCT_ICON: Record<string, any> = { personal: Wallet, home: Home, consumer: Smartphone, vehicle: Car }

const DRAFT_KEY = 'patrata-draft-v3'
function loadDraft(): { form: Form; variant: string | null; ntc: boolean } {
  const form = toForm(BASE)
  let variant: string | null = null, ntc = false
  try {
    const d = JSON.parse(localStorage.getItem(DRAFT_KEY) || localStorage.getItem('patrata-draft-v2') || 'null')
    if (d && typeof d === 'object') {
      const src = d.form || d
      for (const f of FIELDS) if (src[f.id] != null && src[f.id] !== '') form[f.id] = String(src[f.id])
      variant = typeof d.variant === 'string' ? d.variant : null
      ntc = Boolean(d.ntc)
    }
  } catch { /* ignore a corrupt draft */ }
  return { form, variant, ntc }
}

export default function NewApplication() {
  const nav = useNavigate()
  const book = useBook()
  const { state } = useLocation() as { state?: { prefill?: Application; submit?: boolean } }
  const init = useMemo(() => (state?.prefill
    ? { form: toForm(state.prefill), variant: state.prefill.variant || null, ntc: Boolean(state.prefill.no_credit_history) }
    : loadDraft()), [])
  const [form, setForm] = useState<Form>(init.form)
  const [variant, setVariant] = useState<string | null>(init.variant)
  const [product, setProduct] = useState<string | null>(null)
  const [ntc, setNtc] = useState(init.ntc)
  const [step, setStep] = useState(init.variant ? 1 : 0)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState('')
  const [busy, setBusy] = useState(false)
  const [slow, setSlow] = useState(false)
  const last = useRef<{ key: string; req: string } | null>(null)

  const found = findVariant(book, variant)
  const v: Variant | null = found?.v || null
  useEffect(() => { if (found && !product) setProduct(found.p.id) }, [found?.p.id])
  useEffect(() => { try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ form, variant, ntc })) } catch { /* ignore */ } }, [form, variant, ntc])

  const visible = (f: FieldDef) => (f.when === 'property' ? needsProperty(v) : f.when === 'price' ? needsPrice(v) : true)
  const fields = FIELDS.filter(visible)
  const values = useMemo(() => {
    const o: Record<string, number | null> = {}
    fields.forEach((f) => { o[f.id] = f.kind === 'select' ? 0 : num(form[f.id]) })
    return o
  }, [form, variant])
  const complete = Boolean(v) && fields.every((f) => (f.id === 'cibil_score' && ntc) || (values[f.id] !== null && !Number.isNaN(values[f.id])))
  const payloadOf = (src: Form, n = ntc, vid = variant) => {
    const fv = findVariant(book, vid)?.v
    const out: Record<string, unknown> = { variant: vid, no_credit_history: n }
    for (const f of FIELDS) {
      const show = f.when === 'property' ? needsProperty(fv) : f.when === 'price' ? needsPrice(fv) : true
      out[f.id] = !show ? null : f.kind === 'select' ? src[f.id] : f.id === 'cibil_score' && n ? null : num(src[f.id])
    }
    if (fv?.special?.type === 'zero_interest') out.annual_rate = 0
    return out
  }

  // Live preview: the same rules and models via /simulate (nothing saved), debounced while typing.
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
    if (i === 0) { if (!v) { setFormError('Choose a product and a variant first.'); return false } return true }
    const miss: Record<string, string> = {}
    fields.filter((f) => f.step === i).forEach((f) => { if (values[f.id] === null && !(f.id === 'cibil_score' && ntc)) miss[f.id] = 'Required' })
    setErrors((p) => ({ ...p, ...miss }))
    return !Object.keys(miss).length
  }

  async function submit(data?: Form, ntcOverride?: boolean, vidOverride?: string) {
    if (busy) return                                          // blocks double clicks
    const src = data || form
    const payload = payloadOf(src, ntcOverride ?? ntc, vidOverride ?? variant)
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
  useEffect(() => { if (state?.prefill && state.submit) submit(toForm(state.prefill), Boolean(state.prefill.no_credit_history), state.prefill.variant || undefined) }, [])

  const chooseVariant = (id: string) => {
    const fv = findVariant(book, id)?.v
    setVariant(id); setFormError(''); setErrors({})
    if (fv) {                                                 // keep the term inside the new variant's limits
      const m = Math.round((num(form.loan_term) || 0) * 12)
      const c = fv.criteria
      if (m < c.tenure_months_min || m > c.tenure_months_max) setForm((p) => ({ ...p, loan_term: String(Math.min(c.tenure_months_max, Math.max(c.tenure_months_min, 12)) / 12) }))
      if (fv.special?.type === 'zero_interest') setForm((p) => ({ ...p, annual_rate: '0' }))
    }
  }

  const monthOptions = v ? [3, 6, 9, 12, 15, 18, 24, 30, 36, 42, 48].filter((m) => m >= v.criteria.tenure_months_min && m <= v.criteria.tenure_months_max) : []
  const label = (f: FieldDef) => (f.id === 'asset_price' ? (found?.p.id === 'vehicle' ? 'On-road price' : 'Product price') : f.label)

  return (
    <>
      <PageHead title="New application" sub="Choose the loan product and variant, then enter the applicant's details. Each variant has its own rules from lenders' published criteria." />

      <div className="mb-5">
        <p className="mb-2 flex items-center gap-1.5 text-sm text-muted"><Sparkles size={15} aria-hidden="true" />Try an example</p>
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
          {EXAMPLES.map((e) => (
            <button key={e.name} type="button" disabled={busy || !book}
              onClick={() => { const f = toForm(e.data); const n = Boolean(e.data.no_credit_history); setForm(f); setNtc(n); setVariant(e.data.variant || null); setErrors({}); setStep(3); submit(f, n, e.data.variant || undefined) }}
              className="min-h-12 shrink-0 rounded-[14px] border border-field bg-white px-4 py-2 text-left hover:border-brand">
              <span className="block text-sm font-semibold">{e.name}</span>
              <span className="block text-[12px] text-muted">{e.note}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-[1.25fr_1fr]">
        <Card as="form" noValidate onSubmit={(e: React.FormEvent) => { e.preventDefault(); if (stepValid(step)) step < STEPS.length - 1 ? setStep(step + 1) : submit() }}>
          <div className="mb-5">
            <div className="flex gap-1.5" aria-hidden="true">{STEPS.map((_, i) => <span key={i} className={cx('h-1.5 flex-1 rounded-full', i <= step ? 'bg-ink' : 'bg-line-2')} />)}</div>
            <div className="mt-3 flex flex-wrap gap-2" role="tablist" aria-label="Form steps">
              {STEPS.map((s, i) => (
                <button key={s} type="button" role="tab" aria-selected={i === step} onClick={() => (i === 0 || v) && setStep(i)}
                  className={cx('rounded-full px-3 py-1 text-[13px]', i === step ? 'bg-ink text-white' : 'bg-paper text-muted hover:text-ink')}>{i + 1}. {s}</button>
              ))}
            </div>
          </div>

          {step === 0 ? (
            !book ? <Skeleton className="h-40" /> : (
              <div className="space-y-5">
                <fieldset>
                  <legend className="mb-2 text-[13px] text-muted">Loan product</legend>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {book.products.map((p) => {
                      const Icon = PRODUCT_ICON[p.id] || Wallet
                      const on = product === p.id
                      return (
                        <button key={p.id} type="button" aria-pressed={on} onClick={() => { setProduct(p.id); if (found?.p.id !== p.id) setVariant(null) }}
                          className={cx('flex min-h-[92px] flex-col items-start justify-between rounded-[14px] border p-3 text-left', on ? 'border-ink bg-ink text-white' : 'border-line bg-white hover:border-ink')}>
                          <Icon size={22} aria-hidden="true" className={on ? 'text-white' : 'text-brand'} />
                          <span className="text-sm font-semibold">{p.name}</span>
                        </button>
                      )
                    })}
                  </div>
                </fieldset>
                {product && (() => {
                  const p = book.products.find((x) => x.id === product)!
                  return (
                    <fieldset>
                      <legend className="mb-1 text-[13px] text-muted">Variant</legend>
                      <p className="mb-2 text-sm">{p.summary}</p>
                      <div className="space-y-2">
                        {p.variants.map((x) => {
                          const on = variant === x.id
                          return (
                            <button key={x.id} type="button" aria-pressed={on} onClick={() => chooseVariant(x.id)}
                              className={cx('block w-full rounded-[14px] border p-3 text-left', on ? 'border-brand bg-brand-bg' : 'border-line bg-white hover:border-ink')}>
                              <span className="flex items-center justify-between gap-2"><b className="text-[15px]">{x.name}</b>{on && <span className="text-[12px] font-semibold text-brand">Selected</span>}</span>
                              <span className="mt-0.5 block text-[13px] text-muted">{x.for}</span>
                              <span className="mt-2 flex flex-wrap gap-1.5">{x.features.map((f) => <span key={f} className="rounded-full bg-white px-2 py-0.5 text-[12px] ring-1 ring-line">{f}</span>)}</span>
                            </button>
                          )
                        })}
                      </div>
                    </fieldset>
                  )
                })()}
                {v && (
                  <div className="rounded-[14px] border border-line p-3">
                    <p className="mb-2 text-sm font-semibold">What {v.name} needs</p>
                    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[13px]">
                      {criteriaLines(v).map((l) => <div key={l.k} className="contents"><dt className="text-muted">{l.label}</dt><dd>{l.value}</dd></div>)}
                    </dl>
                    {v.special && <p className="mt-2 text-[13px] text-brand">{v.special.rule}</p>}
                    <Link to="/products" className="mt-2 inline-flex items-center gap-1 text-[13px] text-muted underline"><BookOpen size={14} />Sources in the product catalogue</Link>
                  </div>
                )}
              </div>
            )
          ) : (
            <div className="grid grid-cols-1 gap-x-3 gap-y-4 sm:grid-cols-2">
              {fields.filter((f) => f.step === step).map((f) => (
                <div key={f.id} className={cx('flex min-w-0 flex-col gap-1.5', f.wide && 'sm:col-span-2')}>
                  <label htmlFor={f.id} className="text-[13px] text-muted">{label(f)}</label>
                  {f.kind === 'select' ? (
                    <select id={f.id} value={form[f.id]} onChange={(e) => setForm((p) => ({ ...p, [f.id]: e.target.value }))}
                      className="h-12 w-full rounded-[10px] border border-field bg-white px-3 text-base outline-none focus:border-ink">
                      {f.options!.map(([val, l]) => <option key={val} value={val}>{l}</option>)}
                    </select>
                  ) : f.id === 'loan_term' && usesMonths(v) ? (
                    <select id={f.id} value={String(Math.round((num(form.loan_term) || 0) * 12))} onChange={(e) => setForm((p) => ({ ...p, loan_term: String(Number(e.target.value) / 12) }))}
                      className="h-12 w-full rounded-[10px] border border-field bg-white px-3 text-base outline-none focus:border-ink">
                      {!monthOptions.includes(Math.round((num(form.loan_term) || 0) * 12)) && <option value={Math.round((num(form.loan_term) || 0) * 12)}>{Math.round((num(form.loan_term) || 0) * 12)} months</option>}
                      {monthOptions.map((m) => <option key={m} value={m}>{m} months</option>)}
                    </select>
                  ) : (
                    <div className="relative flex items-center">
                      {f.kind === 'inr' && <span className="pointer-events-none absolute left-3 text-muted" aria-hidden="true">₹</span>}
                      <input id={f.id} inputMode={f.kind === 'dec' ? 'decimal' : 'numeric'} autoComplete="off"
                        disabled={(f.id === 'cibil_score' && ntc) || (f.id === 'annual_rate' && v?.special?.type === 'zero_interest')}
                        value={pretty(f, form[f.id])} onChange={(e) => set(f, e.target.value)}
                        aria-invalid={Boolean(errors[f.id])} aria-describedby={`${f.id}-h`}
                        className={cx('h-12 w-full rounded-[10px] border bg-white text-base outline-none focus:border-ink disabled:bg-paper', f.kind === 'inr' ? 'pl-7 pr-3' : 'px-3', f.suffix && 'pr-16',
                          errors[f.id] ? 'border-bad bg-[#FFFBFA]' : 'border-field')} />
                      {f.suffix && <span className="pointer-events-none absolute right-3 text-sm text-muted" aria-hidden="true">{f.suffix}</span>}
                    </div>
                  )}
                  {f.id === 'cibil_score' && (
                    <label className="mt-1 flex cursor-pointer items-start gap-2 rounded-[10px] bg-paper p-3 text-sm">
                      <input type="checkbox" className="mt-0.5 h-4 w-4" checked={ntc} onChange={(e) => { setNtc(e.target.checked); setErrors((p) => { const n = { ...p }; delete n.cibil_score; return n }) }} />
                      <span><b className="font-semibold">No credit history yet</b> (first-time borrower). Patrata won't decline for this alone; a credit officer checks income instead, as RBI's January 2025 direction expects.</span>
                    </label>
                  )}
                  <span id={`${f.id}-h`} className={cx('min-h-[18px] text-[12px]', errors[f.id] ? 'text-bad' : 'text-muted')}>
                    {errors[f.id] || (f.id === 'loan_term' && v ? `${v.criteria.tenure_months_min} to ${v.criteria.tenure_months_max} months for this variant` :
                      f.id === 'annual_rate' && v?.special?.type === 'zero_interest' ? 'No-cost EMI: 0%, paid by the brand or store' :
                      f.kind === 'inr' && values[f.id] ? `${inrShort(values[f.id]!)}${f.hint ? '. ' + f.hint : ''}` : f.hint) || ''}
                  </span>
                </div>
              ))}
            </div>
          )}

          {formError && <div className="mt-2"><Notice tone="bad">{formError}</Notice></div>}
          {slow && <p className="mt-3 text-center text-sm text-warn" role="status">Waking up the server. The first check after a quiet spell can take up to a minute.</p>}
          <div className="mt-5 flex gap-2">
            {step > 0 && <Button type="button" kind="ghost" onClick={() => setStep(step - 1)}>Back</Button>}
            <Button type="submit" className="flex-1" disabled={busy || (step === 0 && !v)}>{busy ? 'Checking…' : step < STEPS.length - 1 ? 'Next' : 'Check eligibility'}</Button>
          </div>
          <p className="mt-4 flex gap-2 rounded-[10px] bg-paper px-3 py-2.5 text-[13px] text-muted">
            <Lock size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
            No name, PAN, Aadhaar or phone number is collected. Only calculated figures are sent to the AI model that writes explanations.
          </p>
        </Card>

        <Card className="lg:sticky lg:top-8" aria-live="polite">
          <p className="text-sm text-muted">Live preview{v ? `, ${v.name}` : ''}</p>
          <h2 className="mb-4 text-[17px] font-semibold">How this application looks so far</h2>
          {!v ? <p className="text-muted">Choose a product and variant to begin.</p> : !complete ? (
            <p className="text-muted">Fill in every field and the preview updates as you type. Nothing is saved until you check eligibility.</p>
          ) : !sim ? (simErr ? <Notice tone="bad">{simErr}</Notice> : <div className="space-y-3"><Skeleton className="h-6 w-2/3" /><Skeleton className="h-3" /></div>) : (
            <div className="space-y-5">
              <div className="flex items-center justify-between gap-3">
                <div><p className="text-sm text-muted">Likely outcome</p><p className="text-xl font-semibold">{WORD[sim.decision]}</p></div>
                <DecisionPill d={sim.decision} />
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-[10px] bg-paper p-3"><p className="text-muted">EMI</p><p className="text-lg font-semibold">{inr(sim.emi_estimate)}</p></div>
                <div className="rounded-[10px] bg-paper p-3"><p className="text-muted">Approval model</p><p className="text-lg font-semibold">{sim.approval_probability == null ? 'Not used' : pct(sim.approval_probability)}</p></div>
              </div>
              <FoirMeter foir={sim.foir} />
              {!ntc && values.cibil_score != null && <CibilMeter score={values.cibil_score} />}
              {sim.rule_checks.some((c) => c.status !== 'pass') && (
                <div>
                  <p className="mb-1 text-sm font-semibold">Needs attention</p>
                  <ul className="space-y-1 text-[13px]">{sim.rule_checks.filter((c) => c.status !== 'pass').map((c) => (
                    <li key={c.id} className={c.status === 'fail' ? 'text-bad' : 'text-warn'}>{c.status === 'fail' ? '✕' : '□'} {c.label}: {c.value} ({c.threshold})</li>
                  ))}</ul>
                </div>
              )}
            </div>
          )}
        </Card>
      </div>
    </>
  )
}
