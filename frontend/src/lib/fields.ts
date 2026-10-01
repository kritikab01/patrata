import type { Application } from './types'

export type Kind = 'inr' | 'int' | 'dec' | 'select'
export interface FieldDef { id: keyof Application; label: string; step: number; kind: Kind; suffix?: string; hint?: string; wide?: boolean; options?: [string, string][] }

export const EMPLOYMENT: [string, string][] = [
  ['salaried', 'Salaried (private job)'], ['self_employed', 'Self-employed or business'], ['government', 'Government employee'],
  ['pensioner', 'Pensioner'], ['not_employed', 'Not currently employed'],
]

export const STEPS = ['Applicant and income', 'The loan', 'Credit and assets']
export const FIELDS: FieldDef[] = [
  { id: 'age', label: 'Age', step: 0, kind: 'int', suffix: 'years', hint: '18 to 75' },
  { id: 'no_of_dependents', label: 'Dependents', step: 0, kind: 'int', hint: 'People relying on this income' },
  { id: 'employment_type', label: 'Employment', step: 0, kind: 'select', options: EMPLOYMENT },
  { id: 'years_in_job', label: 'Years in current job', step: 0, kind: 'dec', suffix: 'years', hint: 'Or years running the business' },
  { id: 'income_annum', label: 'Annual income', step: 0, kind: 'inr', wide: true },
  { id: 'existing_emi_monthly', label: 'Existing EMIs per month', step: 0, kind: 'inr', wide: true, hint: 'Enter 0 if none' },
  { id: 'loan_amount', label: 'Loan amount', step: 1, kind: 'inr', wide: true },
  { id: 'loan_term', label: 'Term', step: 1, kind: 'int', suffix: 'years', hint: '2 to 20 years' },
  { id: 'annual_rate', label: 'Interest rate', step: 1, kind: 'dec', suffix: '% p.a.', hint: 'Only used to estimate the EMI' },
  { id: 'cibil_score', label: 'CIBIL score', step: 2, kind: 'int', wide: true, hint: '300 to 900' },
  { id: 'residential_assets_value', label: 'Residential property', step: 2, kind: 'inr' },
  { id: 'commercial_assets_value', label: 'Commercial property', step: 2, kind: 'inr' },
  { id: 'luxury_assets_value', label: 'Vehicles and valuables', step: 2, kind: 'inr' },
  { id: 'bank_asset_value', label: 'Bank balance and deposits', step: 2, kind: 'inr' },
]

export const BASE: Application = {
  age: 38, no_of_dependents: 1, income_annum: 1800000, existing_emi_monthly: 0, loan_amount: 4500000,
  loan_term: 15, annual_rate: 12, cibil_score: 780, residential_assets_value: 3000000,
  commercial_assets_value: 0, luxury_assets_value: 1500000, bank_asset_value: 800000,
  employment_type: 'salaried', years_in_job: 8,
}

export const EXAMPLES: { name: string; note: string; data: Application }[] = [
  { name: 'Strong applicant', note: 'Salaried 8 yrs, CIBIL 780', data: { ...BASE } },
  { name: 'High EMI burden', note: 'Existing EMIs ₹40,000', data: { ...BASE, existing_emi_monthly: 40000 } },
  { name: 'Young, new job', note: '24, six months in job', data: { ...BASE, age: 24, years_in_job: 0.5, loan_term: 10, residential_assets_value: 0, luxury_assets_value: 0 } },
  { name: 'Borderline CIBIL', note: 'Score 650', data: { ...BASE, cibil_score: 650 } },
  { name: 'Low CIBIL', note: 'Score 520', data: { ...BASE, cibil_score: 520 } },
  { name: 'Unusual applicant', note: 'Earns ₹3 crore a year', data: { ...BASE, income_annum: 30000000, loan_amount: 6000000 } },
]

export const CSV_COLUMNS: string[] = ['ref', ...FIELDS.map((f) => f.id as string)]
