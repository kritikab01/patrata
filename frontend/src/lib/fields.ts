import type { Application } from './types'

export type Kind = 'inr' | 'int' | 'dec' | 'select'
export interface FieldDef { id: keyof Application; label: string; step: number; kind: Kind; suffix?: string; hint?: string; wide?: boolean; options?: [string, string][]; when?: 'property' | 'price' }

export const EMPLOYMENT: [string, string][] = [
  ['salaried', 'Salaried (private job)'], ['self_employed', 'Self-employed or business'], ['government', 'Government employee'],
  ['pensioner', 'Pensioner'], ['not_employed', 'Not currently employed'],
]

export const STEPS = ['Product', 'Applicant and income', 'The loan', 'Credit and assets']
export const FIELDS: FieldDef[] = [
  { id: 'age', label: 'Age', step: 1, kind: 'int', suffix: 'years', hint: '18 to 75' },
  { id: 'no_of_dependents', label: 'Dependents', step: 1, kind: 'int', hint: 'People relying on this income' },
  { id: 'employment_type', label: 'Employment', step: 1, kind: 'select', options: EMPLOYMENT },
  { id: 'years_in_job', label: 'Years in current job', step: 1, kind: 'dec', suffix: 'years', hint: 'Or years running the business' },
  { id: 'income_annum', label: 'Annual income', step: 1, kind: 'inr', wide: true },
  { id: 'existing_emi_monthly', label: 'Existing EMIs per month', step: 1, kind: 'inr', wide: true, hint: 'Enter 0 if none' },
  { id: 'loan_amount', label: 'Loan amount', step: 2, kind: 'inr', wide: true },
  { id: 'property_value', label: 'Property value', step: 2, kind: 'inr', wide: true, when: 'property', hint: 'RBI caps the loan at a share of this' },
  { id: 'asset_price', label: 'Price', step: 2, kind: 'inr', wide: true, when: 'price' },
  { id: 'loan_term', label: 'Term', step: 2, kind: 'dec', suffix: 'years' },
  { id: 'annual_rate', label: 'Interest rate', step: 2, kind: 'dec', suffix: '% p.a.', hint: 'Only used to estimate the EMI' },
  { id: 'cibil_score', label: 'CIBIL score', step: 3, kind: 'int', wide: true, hint: '300 to 900' },
  { id: 'existing_loans_count', label: 'Active loans and cards', step: 3, kind: 'int', hint: 'From the credit report' },
  { id: 'outstanding_debt', label: 'Total outstanding on them', step: 3, kind: 'inr' },
  { id: 'credit_history_years', label: 'Years of credit history', step: 3, kind: 'dec', suffix: 'years', hint: 'Since the first loan or card' },
  { id: 'new_loans_12m', label: 'New loans in last 12 months', step: 3, kind: 'int', hint: '3 or more needs a review' },
  { id: 'overdue_now', label: 'Any payment overdue now?', step: 3, kind: 'select', options: [['no', 'No'], ['yes', 'Yes']], wide: true },
  { id: 'residential_assets_value', label: 'Residential property', step: 3, kind: 'inr' },
  { id: 'commercial_assets_value', label: 'Commercial property', step: 3, kind: 'inr' },
  { id: 'luxury_assets_value', label: 'Vehicles and valuables', step: 3, kind: 'inr' },
  { id: 'bank_asset_value', label: 'Bank balance and deposits', step: 3, kind: 'inr' },
]

export const BASE: Application = {
  age: 38, no_of_dependents: 1, income_annum: 1800000, existing_emi_monthly: 0, loan_amount: 4500000,
  loan_term: 15, annual_rate: 12, cibil_score: 780, residential_assets_value: 3000000,
  commercial_assets_value: 0, luxury_assets_value: 1500000, bank_asset_value: 800000,
  employment_type: 'salaried', years_in_job: 8,
  existing_loans_count: 1, outstanding_debt: 300000, overdue_now: false, credit_history_years: 8, new_loans_12m: 0,
}

export const EXAMPLES: { name: string; note: string; data: Application }[] = [
  { name: 'Home loan, strong', note: '₹45 L on a ₹65 L flat', data: { ...BASE, loan_term: 20, annual_rate: 9, variant: 'hl_salaried', property_value: 6500000 } },
  { name: 'Home loan, low down payment', note: '₹45 L on a ₹50 L flat', data: { ...BASE, loan_term: 20, annual_rate: 9, variant: 'hl_salaried', property_value: 5000000 } },
  { name: 'Personal loan, high EMIs', note: 'Existing EMIs ₹30,000', data: { ...BASE, income_annum: 1200000, loan_amount: 800000, loan_term: 4, annual_rate: 14, existing_emi_monthly: 30000, existing_loans_count: 3, outstanding_debt: 1200000, variant: 'pl_salaried' } },
  { name: 'Flexi Hybrid', note: 'Interest-only for 24 months', data: { ...BASE, loan_amount: 800000, loan_term: 4, annual_rate: 14, variant: 'pl_flexi_hybrid' } },
  { name: 'Phone on no-cost EMI', note: '₹60,000 over 12 months', data: { ...BASE, income_annum: 600000, loan_amount: 60000, loan_term: 1, annual_rate: 0, variant: 'cd_no_cost', asset_price: 60000 } },
  { name: 'First bike, no CIBIL', note: 'Age 23, first job', data: { ...BASE, age: 23, years_in_job: 1, income_annum: 300000, loan_amount: 90000, loan_term: 3, annual_rate: 12, cibil_score: null, no_credit_history: true, residential_assets_value: 0, luxury_assets_value: 0, existing_loans_count: 0, outstanding_debt: 0, credit_history_years: 0, new_loans_12m: 0, variant: 'vl_two_wheeler', asset_price: 110000 } },
  { name: 'Wrong variant chosen', note: 'Self-employed on a salaried PL', data: { ...BASE, employment_type: 'self_employed', loan_amount: 800000, loan_term: 4, annual_rate: 14, variant: 'pl_salaried' } },
]

export const CSV_COLUMNS: string[] = ['ref', 'variant', ...FIELDS.map((f) => f.id as string)]
export const CREDIT_FIELDS = ['existing_loans_count', 'outstanding_debt', 'credit_history_years', 'new_loans_12m', 'overdue_now']
