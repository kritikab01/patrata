import { useEffect, useState } from 'react'
import { Bar as RBar, BarChart, Cell, LabelList, ResponsiveContainer, XAxis, YAxis } from 'recharts'
import { api } from '../lib/api'
import { Card, CardTitle, Kpi, PageHead, Skeleton } from '../components/ui'

const STACK = [
  ['Machine learning', 'Two XGBoost models with monotone constraints and SHAP: approval (4,269 Indian applications) and repayment risk (307,511 real loans)'],
  ['Backend', 'FastAPI with Pydantic validation, SQLite audit log, 61 automated tests'],
  ['Generative AI', 'Llama 3.3 70B on Groq (free tier) for explanations and the assistant; Gemini, OpenAI, OpenRouter or local Ollama with one setting'],
  ['Retrieval', 'BM25 search over Patrata\'s policy notes, with cited answers'],
  ['AI agent', 'Review Agent: the LLM plans tool calls (re-score, policy lookup, loan cost) in a guarded loop and drafts a memo; a person decides'],
  ['Frontend', 'React, TypeScript, Tailwind CSS, Recharts, Web Speech API for voice'],
  ['Hosting', 'Docker on Hugging Face Spaces, one link for the app and the API'],
]

export default function ModelCard() {
  const [m, setM] = useState<any>(null)
  useEffect(() => { api('/model-card').then(setM).catch(() => setM(false)) }, [])
  if (m === false) return <p className="text-bad">Couldn't load the model card.</p>
  const acc = m ? [
    { name: 'One-line rule', v: m.data_audit.one_line_rule_accuracy },
    { name: 'Logistic regression', v: m.metrics.logistic_regression.accuracy },
    { name: 'XGBoost (Patrata)', v: m.metrics.xgboost.accuracy },
  ] : []
  const imp = m ? Object.entries(m.global_importance as Record<string, number>).map(([k, v]) => ({ name: m.labels[k] || k, v })) : []
  const cm = m?.metrics.xgboost.confusion
  const p = m?.policy

  return (
    <>
      <PageHead title="Model and governance" sub="How Patrata was built, how well it works, and where it shouldn't be trusted. Figures load live from the trained model." />
      {!m ? <Skeleton className="h-96 w-full rounded-2xl" /> : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi label="Test accuracy" value={`${(m.metrics.xgboost.accuracy * 100).toFixed(1)}%`} sub={`${cm.tn + cm.fp + cm.fn + cm.tp} unseen applications`} />
            <Kpi label="ROC-AUC" value={m.metrics.xgboost.roc_auc.toFixed(3)} sub={`Cross-validated ${m.metrics.xgboost.cv_roc_auc_mean.toFixed(3)}`} />
            <Kpi label="Rejections caught" value={`${(m.metrics.xgboost.recall_reject * 100).toFixed(1)}%`} sub={`${cm.fp} wrongly approved`} />
            <Kpi label="Assistant retrieval" value={`${m.assistant_retrieval_eval.top1_hits}/${m.assistant_retrieval_eval.questions}`} sub="Test questions matched to the right source first, including Hindi" />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardTitle sub="A simple rule is already strong on this data, so we say so openly">Accuracy compared</CardTitle>
              <div className="h-[190px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={acc} layout="vertical" margin={{ left: 10, right: 50 }}>
                    <XAxis type="number" domain={[0.8, 1]} hide />
                    <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 13, fill: '#0A0A0A' }} tickLine={false} axisLine={false} />
                    <RBar dataKey="v" radius={[0, 6, 6, 0]}>
                      {acc.map((a, i) => <Cell key={i} fill={i === 2 ? '#0A0A0A' : '#A1A1AA'} />)}
                      <LabelList dataKey="v" position="right" formatter={(v: any) => `${(v * 100).toFixed(1)}%`} style={{ fontSize: 13, fill: '#0A0A0A', fontWeight: 600 }} />
                    </RBar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <p className="text-sm text-muted">Accuracy is high because the data follows a near-fixed rule, not because credit risk is easy. Real bureau and repayment data would be needed before live use.</p>
            </Card>
            <Card>
              <CardTitle sub="Average impact across all test applications (mean |SHAP|)">What the model relies on</CardTitle>
              <div className="h-[250px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={imp} layout="vertical" margin={{ left: 10, right: 30 }}>
                    <XAxis type="number" hide />
                    <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 12, fill: '#0A0A0A' }} tickLine={false} axisLine={false} />
                    <RBar dataKey="v" fill="#0A0A0A" radius={[0, 6, 6, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card>
              <CardTitle>What the data showed</CardTitle>
              <ul className="space-y-2 text-sm">
                <li>Approval jumps from <b>{(m.data_audit.approval_rate_cibil_below_550 * 100).toFixed(1)}%</b> to <b>{(m.data_audit.approval_rate_cibil_550_plus * 100).toFixed(1)}%</b> at CIBIL 550.</li>
                <li>A one-line rule ({m.data_audit.one_line_rule}) gets <b>{(m.data_audit.one_line_rule_accuracy * 100).toFixed(1)}%</b>.</li>
                <li><b>{m.data_audit.negative_asset_rows}</b> rows had negative asset values; they were set to zero.</li>
                <li>Loan-to-income only spans {m.data_audit.loan_to_income_range[0]}x to {m.data_audit.loan_to_income_range[1]}x, so unusual applicants are referred.</li>
              </ul>
            </Card>
            <Card>
              <CardTitle sub="Share approved by the model, test set">Fairness check</CardTitle>
              <table className="w-full text-sm">
                <tbody>
                  {Object.entries(m.fairness_outcome_parity as Record<string, Record<string, number>>).flatMap(([g, vals]) =>
                    Object.entries(vals).map(([k, v]) => <tr key={g + k}><td className="border-b border-line-2 py-1.5 capitalize">{g.replace('_', ' ')}: {k}</td><td className="border-b border-line-2 py-1.5 text-right font-semibold">{(v * 100).toFixed(1)}%</td></tr>))}
                </tbody>
              </table>
              <p className="mt-2 text-[13px] text-muted">Education and self-employment are not model inputs; approval rates stay close across both groups.</p>
            </Card>
            <Card>
              <CardTitle>Policy thresholds</CardTitle>
              <table className="w-full text-sm">
                <thead><tr className="text-left text-muted"><th className="pb-1 font-medium">Check</th><th className="pb-1 font-medium">Clear</th><th className="pb-1 font-medium">Review</th><th className="pb-1 font-medium">Decline</th></tr></thead>
                <tbody>
                  <tr><td className="border-t border-line-2 py-1.5">CIBIL</td><td className="border-t border-line-2">{p.cibil_soft_floor}+</td><td className="border-t border-line-2">{p.cibil_hard_floor}–{p.cibil_soft_floor - 1}</td><td className="border-t border-line-2">&lt;{p.cibil_hard_floor}</td></tr>
                  <tr><td className="border-t border-line-2 py-1.5">EMI burden</td><td className="border-t border-line-2">≤{p.foir_soft_cap * 100}%</td><td className="border-t border-line-2">{p.foir_soft_cap * 100}–{p.foir_hard_cap * 100}%</td><td className="border-t border-line-2">&gt;{p.foir_hard_cap * 100}%</td></tr>
                  <tr><td className="border-t border-line-2 py-1.5">Age</td><td className="border-t border-line-2">{p.age[0]}–{p.age[1]}</td><td className="border-t border-line-2">none</td><td className="border-t border-line-2">outside</td></tr>
                  <tr><td className="border-t border-line-2 py-1.5">Model</td><td className="border-t border-line-2">≥{p.approve_at * 100}%</td><td className="border-t border-line-2">between</td><td className="border-t border-line-2">&lt;{p.decline_below * 100}%*</td></tr>
                </tbody>
              </table>
              <p className="mt-2 text-[12px] text-muted">*Only together with a review flag. The model never declines alone.</p>
            </Card>
          </div>

          {m.risk_model && (() => {
            const k = m.risk_model
            const lift = k.metrics.decile_lift.map((v: number, i: number) => ({ d: `${i + 1}`, v }))
            return (
              <Card>
                <CardTitle sub={`${k.data_source}. Version ${k.model_version}.`}>Second model: repayment risk from {k.rows.toLocaleString('en-IN')} real loans</CardTitle>
                <div className="grid gap-6 lg:grid-cols-3">
                  <div className="space-y-3 text-sm">
                    <p>Predicts the chance of payment difficulties using only currency-free facts: EMI as a share of income, age, years in the job, employment type, dependents, and home and vehicle ownership.</p>
                    <p><b>ROC-AUC {k.metrics.roc_auc.toFixed(3)}</b> (logistic regression {k.metrics.logistic_regression_roc_auc.toFixed(3)}). Modest, and realistic: real default prediction is hard, which is why this model informs the decision and never declines alone.</p>
                    <p className="text-muted">Excluded on purpose: {k.excluded_on_purpose.join(', ')}.</p>
                  </div>
                  <div>
                    <p className="mb-1 text-sm text-muted">Default rate by risk decile, vs the {(k.base_default_rate * 100).toFixed(1)}% average</p>
                    <div className="h-[180px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={lift} margin={{ left: -24, right: 4, top: 4 }}>
                          <XAxis dataKey="d" tick={{ fontSize: 11, fill: '#52525B' }} tickLine={false} axisLine={false} />
                          <YAxis tick={{ fontSize: 11, fill: '#52525B' }} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}x`} />
                          <RBar dataKey="v" radius={[4, 4, 0, 0]}>{lift.map((x: any, i: number) => <Cell key={i} fill={x.v >= 1 ? '#B42318' : '#0A0A0A'} />)}</RBar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                    <p className="text-[12px] text-muted">The riskiest 10% default {k.metrics.top_vs_bottom_decile}× as often as the safest 10%.</p>
                  </div>
                  <div className="text-sm">
                    <p className="mb-2 text-muted">What actually happened in each band (test set of {k.metrics.test_rows.toLocaleString('en-IN')})</p>
                    <table className="w-full">
                      <tbody>
                        {(['low', 'medium', 'high'] as const).map((b) => (
                          <tr key={b}><td className="border-b border-line-2 py-1.5 capitalize">{b} risk</td>
                            <td className="border-b border-line-2 py-1.5 text-right">{Math.round(k.metrics.band_outcomes[b].share * 100)}% of borrowers</td>
                            <td className="border-b border-line-2 py-1.5 text-right font-semibold">{(k.metrics.band_outcomes[b].actual_default_rate * 100).toFixed(1)}% defaulted</td></tr>
                        ))}
                      </tbody>
                    </table>
                    <p className="mt-3 text-muted">Fairness: average predicted risk {Object.entries(k.fairness_mean_predicted_risk.gender).map(([g, v]: any) => `${g === 'F' ? 'women' : g === 'M' ? 'men' : g} ${(v * 100).toFixed(1)}%`).join(', ')}.</p>
                  </div>
                </div>
              </Card>
            )
          })()}

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardTitle>Limits we designed around</CardTitle>
              <ul className="list-disc space-y-2 pl-5 text-sm">{m.limitations.map((l: string) => <li key={l}>{l}</li>)}</ul>
            </Card>
            <Card>
              <CardTitle>Privacy and the AI's role</CardTitle>
              <p className="text-sm">{m.llm.provider} ({m.llm.model}) is used for <b>{m.llm.role}</b>. What is sent: {m.llm.data_sent}. No name, PAN, Aadhaar, phone or address is ever collected. Every number in an AI explanation is checked against the calculation, and a template is used if the AI fails.</p>
            </Card>
          </div>

          <Card>
            <CardTitle sub={`Model version ${m.model_version}. Data: ${m.data_source}.`}>How it's built</CardTitle>
            <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
              {STACK.map(([k, v]) => <div key={k}><dt className="text-[13px] text-muted">{k}</dt><dd className="font-medium">{v}</dd></div>)}
            </dl>
          </Card>
        </div>
      )}
    </>
  )
}
