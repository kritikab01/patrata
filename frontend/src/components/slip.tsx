import { useEffect, useState } from 'react'
import { Printer, X } from 'lucide-react'
import { api } from '../lib/api'
import type { Result } from '../lib/types'
import { inr, pct, when } from '../lib/format'

/* The decision slip: a thermal-receipt record of one screening, like an ATM or UPI slip.
   It is the on-screen "Decision slip" and also what prints (Save as PDF). */

interface Kfs { monthly_emi: string; total_interest: string; processing_fee: string; apr_including_fee: string; interest_rate: string; tenure: string }

const RESULT = { APPROVE: 'APPROVE', REFER: 'REFER', DECLINE: 'DECLINE' } as const
const CHECK = { pass: 'OK', refer: '** REVIEW', fail: '** FAIL' } as const

function Edge({ flip = false }: { flip?: boolean }) {
  const pts = Array.from({ length: 35 }, (_, i) => `${i * 10},${(i % 2 === 0) !== flip ? 10 : 0}`).join(' ')
  return (
    <svg width="100%" height="10" viewBox="0 0 340 10" preserveAspectRatio="none" aria-hidden="true" className="block">
      <polygon fill="#FFFFFF" points={flip ? `0,0 ${pts} 340,0` : `0,10 ${pts} 340,10`} />
    </svg>
  )
}

function Barcode({ text }: { text: string }) {
  let x = 0
  const bars: { x: number; w: number }[] = []
  for (const ch of (text + text).slice(0, 24)) {
    const c = ch.charCodeAt(0)
    for (const w of [1 + (c % 3), 1 + ((c >> 2) % 3)]) { bars.push({ x, w }); x += w + 1 + (c % 2) }
  }
  return (
    <svg width="100%" height="40" viewBox={`0 0 ${x} 40`} preserveAspectRatio="none" role="img" aria-label={`Barcode for application ${text}`}>
      {bars.map((b, i) => <rect key={i} x={b.x} width={b.w} height="40" fill="#111111" />)}
    </svg>
  )
}

const Row = ({ l, r, bold }: { l: string; r: string; bold?: boolean }) => (
  <div className={`flex justify-between gap-3 ${bold ? 'font-bold' : ''}`}><span>{l}</span><span className="text-right">{r}</span></div>
)
const Rule = () => <div className="my-1.5 border-t border-dashed border-[#111111]" />

export function SlipBody({ r, kfs }: { r: Result; kfs: Kfs | null }) {
  const a = r.application
  const cf = r.counterfactual
  return (
    <div className="mx-auto w-full max-w-[340px]">
      <Edge />
      <div className="font-slip bg-white px-5 py-3 text-[13.5px] leading-snug text-[#111111]">
        <p className="text-center text-[16px] font-bold">PATRATA CREDIT DESK</p>
        <p className="text-center">PRE-SCREENING SLIP</p>
        <p className="text-center text-[12px]">{when(r.created_at).toUpperCase()}  APP {r.id.toUpperCase()}</p>
        <Rule />
        <Row l="LOAN ASKED" r={inr(a.loan_amount).replace('₹', 'Rs ')} />
        <Row l="TERM / RATE" r={`${a.loan_term}Y / ${a.annual_rate.toFixed(2)}%`} />
        <Row l="NEW EMI" r={inr(r.emi_estimate).replace('₹', 'Rs ')} />
        <Row l="OLD EMIS" r={inr(a.existing_emi_monthly).replace('₹', 'Rs ')} />
        <Row l="INCOME / MONTH" r={inr(a.income_annum / 12).replace('₹', 'Rs ')} />
        <Rule />
        {r.rule_checks.map((c) => <Row key={c.id} l={`${c.label.toUpperCase().replace(' (FOIR)', '')} ${c.value.toUpperCase()}`} r={CHECK[c.status]} bold={c.status !== 'pass'} />)}
        <Row l="APPROVAL MODEL" r={pct(r.approval_probability).toUpperCase()} />
        <div className="my-2 bg-[#111111] py-1.5 text-center text-[17px] font-bold text-white">RESULT: {RESULT[r.decision]}</div>
        {r.review && <Row l="FINAL (REVIEWED)" r={r.review.final_decision} bold />}
        {cf.possible && cf.loan_amount && r.decision !== 'APPROVE' && (
          <><p>SUGGESTED: {inr(cf.loan_amount).replace('₹', 'Rs ')} / {cf.loan_term}Y</p></>
        )}
        <Rule />
        <p className="font-bold">KEY FACTS (AS ASKED)</p>
        {kfs ? (<>
          <Row l="EMI" r={kfs.monthly_emi.replace('₹', 'Rs ')} />
          <Row l="TOTAL INTEREST" r={kfs.total_interest.replace('₹', 'Rs ')} />
          <Row l="PROCESSING FEE 1%" r={kfs.processing_fee.replace('₹', 'Rs ')} />
          <Row l="APR INCL. FEES" r={kfs.apr_including_fee} bold />
        </>) : <p>LOADING...</p>}
        <Rule />
        <Barcode text={r.id.toUpperCase()} />
        <div className="mt-3 grid grid-cols-2 gap-4 text-[12px]"><span className="border-t border-[#111111] pt-1">OFFICER</span><span className="border-t border-[#111111] pt-1">MANAGER</span></div>
        <p className="mt-2 text-center text-[11.5px]">DECISION SUPPORT ONLY. THE LENDER DECIDES.<br />NO PERSONAL IDENTIFIERS COLLECTED.<br />MODEL {r.model_version}</p>
      </div>
      <Edge flip />
    </div>
  )
}

export function useKfs(id: string, enabled: boolean) {
  const [kfs, setKfs] = useState<Kfs | null>(null)
  useEffect(() => { if (enabled && !kfs) api<Kfs>(`/applications/${id}/kfs`).then(setKfs).catch(() => {}) }, [id, enabled])
  return kfs
}

export function SlipModal({ r, kfs, onClose }: { r: Result; kfs: Kfs | null; onClose: () => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k)
  }, [onClose])
  return (
    <div className="no-print fixed inset-0 z-50 flex items-end justify-center bg-ink/60 sm:items-center" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Decision slip" className="max-h-[92vh] w-full max-w-[420px] overflow-y-auto rounded-t-3xl bg-[#D6D6D2] p-5 sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <p className="font-display text-lg font-extrabold">Decision slip</p>
          <button type="button" aria-label="Close" onClick={onClose} className="grid h-10 w-10 place-items-center rounded-full hover:bg-black/10"><X size={20} /></button>
        </div>
        <SlipBody r={r} kfs={kfs} />
        <button type="button" onClick={() => window.print()} className="mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-[10px] bg-ink font-semibold text-white">
          <Printer size={18} />Print or save as PDF
        </button>
      </div>
    </div>
  )
}
