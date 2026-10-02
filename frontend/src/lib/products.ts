import { useEffect, useState } from 'react'
import { api } from './api'

export interface Variant {
  id: string; name: string; for: string; features: string[]; criteria: Record<string, any>
  special?: { type: string; interest_only_months?: number; rule: string }
  assumptions: string[]; documents: string[]; sources: { label: string; url: string }[]
}
export interface Product { id: string; name: string; secured: boolean; summary: string; variants: Variant[] }
export interface Book { version: string; note: string; products: Product[] }

let cache: Promise<Book> | null = null
export const loadBook = () => (cache ||= api<Book>('/products'))
export function useBook() {
  const [b, setB] = useState<Book | null>(null)
  useEffect(() => { loadBook().then(setB).catch(() => { cache = null }) }, [])
  return b
}
export function findVariant(b: Book | null, id?: string | null) {
  for (const p of b?.products || []) for (const v of p.variants) if (v.id === id) return { p, v }
  return null
}
export const usesMonths = (v?: Variant | null) => Boolean(v && v.criteria.tenure_months_max <= 48)
export const needsProperty = (v?: Variant | null) => v?.criteria.ltv === 'rbi_home'
export const needsPrice = (v?: Variant | null) => v?.criteria.ltv === 'asset'

const EMP: Record<string, string> = { salaried: 'Salaried', government: 'Government', self_employed: 'Self-employed', pensioner: 'Pensioner', not_employed: 'Not employed' }
const rs = (n: number) => '₹' + new Intl.NumberFormat('en-IN').format(n)

/** The criteria as plain label/value lines, with a flag for Patrata's own assumptions. */
export function criteriaLines(v: Variant): { k: string; label: string; value: string }[] {
  const c = v.criteria, a = c.age_max_at_maturity
  const age = typeof a === 'object' ? Object.entries(a).map(([k, x]) => `${EMP[k] || k} ${x}`).join(', ') : `${a}`
  const out = [
    { k: 'employment', label: 'Who can apply', value: (c.employment as string[]).map((e) => EMP[e]).join(', ') },
    { k: 'age_min', label: 'Age', value: `${c.age_min}+ today; at most ${age} when the loan ends` },
    'min_monthly_income' in c ? { k: 'min_monthly_income', label: 'Minimum income', value: `${rs(c.min_monthly_income)} a month` }
      : { k: 'min_annual_income', label: 'Minimum income', value: `${rs(c.min_annual_income)} a year` },
    { k: 'min_years_in_job', label: 'Job or business years', value: `${c.min_years_in_job}+` },
    { k: 'cibil_min', label: 'CIBIL', value: `${c.cibil_clear}+ clear, ${c.cibil_min} minimum` },
    { k: 'foir_clear', label: 'EMI burden', value: `up to ${Math.round(c.foir_clear * 100)}% clear, ${Math.round(c.foir_max * 100)}% maximum` },
    { k: 'amount_min', label: 'Amount', value: `${rs(c.amount_min)} to ${rs(c.amount_max)}` },
    { k: 'tenure_months_min', label: 'Tenure', value: `${c.tenure_months_min} to ${c.tenure_months_max} months` },
  ]
  if (c.ltv === 'rbi_home') out.push({ k: 'ltv', label: 'Loan-to-value', value: 'RBI: 90% up to ₹30 L, 80% to ₹75 L, 75% above' })
  if (c.ltv === 'asset') out.push({ k: 'max_ltv', label: 'Funding', value: `up to ${Math.round(c.max_ltv * 100)}% of the price` })
  return out
}
export const isAssumption = (v: Variant, k: string) => v.assumptions.includes(k) || (k === 'cibil_min' && v.assumptions.includes('cibil_clear'))
