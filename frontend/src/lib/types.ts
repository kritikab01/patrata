export type Decision = 'APPROVE' | 'REFER' | 'DECLINE'
export type Lang = 'en' | 'hi'

export interface RuleCheck { id: string; label: string; status: 'pass' | 'refer' | 'fail'; value: string; threshold: string; detail: string }
export interface Driver { feature: string; label: string; value: string; impact: number; direction: 'towards_approval' | 'towards_decline' }
export interface Counterfactual { possible: boolean; loan_amount?: number | null; loan_term?: number | null; summary: string }
export interface Review { final_decision: 'APPROVE' | 'DECLINE'; note: string; reviewer: string; created_at: string }

export interface Application {
  age: number; no_of_dependents: number; income_annum: number; loan_amount: number; loan_term: number
  cibil_score: number | null; residential_assets_value: number; commercial_assets_value: number
  luxury_assets_value: number; bank_asset_value: number; existing_emi_monthly: number; annual_rate: number
  employment_type: string; years_in_job: number; no_credit_history?: boolean
}

export interface Result {
  id: string; decision: Decision; approval_probability: number | null; reasons: string[]
  rule_checks: RuleCheck[]; drivers: Driver[]; counterfactual: Counterfactual; flags: string[]
  warnings: string[]; emi_estimate: number; foir: number; model_version: string; created_at: string
  application: Application; sample: boolean; review: Review | null; status: string
  repayment_risk: RepaymentRisk
}

export interface RepaymentRisk {
  probability: number; band: 'low' | 'medium' | 'high'; base_rate: number; relative: number; employment: string
  drivers: { feature: string; label: string; value: string; impact: number; direction: 'raises_risk' | 'lowers_risk' }[]
}

export interface Simulation {
  decision: Decision; approval_probability: number | null; foir: number; emi_estimate: number
  flags: string[]; rule_checks: RuleCheck[]; drivers: Driver[]; reasons: string[]
}

export interface Explanation { summary: string; reasons: string[]; next_steps: string; language: Lang; source: 'llm' | 'template'; fallback_reason?: string | null }
export interface ChatMsg { role: 'user' | 'assistant'; content: string; sources?: { n: number; title: string }[]; source?: string; kind?: 'grounded' | 'general' | 'calculator' | 'guard'; calc?: Record<string, string> | null }
