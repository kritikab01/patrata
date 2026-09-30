import { useMemo, useRef, useState } from 'react'
import { Download, FileSpreadsheet, Play, Upload } from 'lucide-react'
import { api } from '../lib/api'
import { BASE, CSV_COLUMNS } from '../lib/fields'
import type { Decision } from '../lib/types'
import { inr, pct } from '../lib/format'
import { Button, Card, CardTitle, cx, DecisionPill, Kpi, Notice, PageHead } from '../components/ui'

interface Row { row: number; ref: string; valid: boolean; decision?: Decision; approval_probability?: number; foir?: number; emi_estimate?: number; reason?: string; suggested_change?: string; errors?: { field: string; message: string }[] }
interface Out { summary: Record<string, number>; rows: Row[] }

function parseCsv(text: string): Record<string, string>[] {
  const lines = text.replace(/\r/g, '').split('\n').filter((l) => l.trim())
  const split = (l: string) => {
    const out: string[] = []; let cur = '', q = false
    for (const ch of l) { if (ch === '"') q = !q; else if (ch === ',' && !q) { out.push(cur); cur = '' } else cur += ch }
    out.push(cur); return out.map((s) => s.trim())
  }
  const head = split(lines[0]).map((h) => h.toLowerCase())
  return lines.slice(1).map((l) => Object.fromEntries(split(l).map((v, i) => [head[i], v])))
}
const toCsv = (rows: (string | number)[][]) => rows.map((r) => r.map((v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : v)).join(',')).join('\n')
function download(name: string, text: string) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv' })); a.download = name; a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

function sampleBatch(): Record<string, string>[] {
  let seed = 7
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  return Array.from({ length: 24 }, (_, i) => {
    const income = Math.round((4 + rnd() * 40) * 1e5 / 1e4) * 1e4
    const r: Record<string, number | string> = {
      ref: `LEAD-${1001 + i}`, ...BASE, income_annum: income, loan_amount: Math.round(income * (1.2 + rnd() * 1.6) / 1e4) * 1e4,
      loan_term: [8, 10, 12, 15, 15, 20][Math.floor(rnd() * 6)], cibil_score: Math.round(560 + rnd() * 330),
      existing_emi_monthly: rnd() < 0.6 ? 0 : Math.round(income / 12 * rnd() * 0.2 / 100) * 100,
      age: 24 + Math.floor(rnd() * 30), residential_assets_value: Math.round(income * rnd() * 3 / 1e4) * 1e4,
    }
    if (i === 17) r.cibil_score = 1200          // one deliberately bad row, to show validation
    return Object.fromEntries(Object.entries(r).map(([k, v]) => [k, String(v)]))
  })
}

export default function Batch() {
  const [rows, setRows] = useState<Record<string, string>[] | null>(null)
  const [name, setName] = useState('')
  const [out, setOut] = useState<Out | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [filter, setFilter] = useState<'all' | Decision | 'INVALID'>('all')
  const file = useRef<HTMLInputElement>(null)

  const missing = useMemo(() => rows && rows.length ? CSV_COLUMNS.filter((c) => c !== 'ref' && !(c in rows[0])) : [], [rows])

  function onFile(f: File) {
    setOut(null); setErr('')
    const reader = new FileReader()
    reader.onload = () => {
      try { const p = parseCsv(String(reader.result)); if (!p.length) throw new Error(); setRows(p.slice(0, 500)); setName(f.name) }
      catch { setErr("Couldn't read that file. Use the template's columns and save as CSV.") }
    }
    reader.readAsText(f)
  }
  async function run() {
    if (!rows) return
    setBusy(true); setErr('')
    try {
      const payload = rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, k === 'ref' ? v : v === '' ? null : Number(v.replace(/,/g, ''))])))
      setOut(await api<Out>('/batch', { json: { rows: payload } }))
    } catch { setErr('Scoring failed. Check the file and try again.') } finally { setBusy(false) }
  }
  function exportResults() {
    if (!out) return
    download('patrata-batch-results.csv', toCsv([
      ['row', 'ref', 'decision', 'approval_likelihood', 'emi_burden', 'new_emi', 'main_reason', 'suggested_change', 'errors'],
      ...out.rows.map((r) => [r.row, r.ref, r.valid ? r.decision! : 'INVALID', r.valid ? pct(r.approval_probability!) : '', r.valid ? `${(r.foir! * 100).toFixed(1)}%` : '',
        r.valid ? Math.round(r.emi_estimate!) : '', r.reason || '', r.suggested_change || '', (r.errors || []).map((e) => `${e.field}: ${e.message}`).join('; ')]),
    ]))
  }
  const shown = out ? out.rows.filter((r) => filter === 'all' || (filter === 'INVALID' ? !r.valid : r.decision === filter)) : []

  return (
    <>
      <PageHead title="Batch screening" sub="Score a whole list at once, for example leads from a DSA partner or a branch's daily intake. Up to 500 rows per file." />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardTitle sub="Columns the file must have">1. Get the template</CardTitle>
          <p className="mb-4 text-sm text-muted">One row per applicant. Amounts in rupees, no symbols. The <code>ref</code> column is your own reference, such as a lead ID.</p>
          <Button kind="ghost" onClick={() => download('patrata-template.csv', toCsv([CSV_COLUMNS, ['LEAD-0001', ...CSV_COLUMNS.slice(1).map((c) => (BASE as any)[c])]]))}><FileSpreadsheet size={17} />Download template</Button>
        </Card>
        <Card>
          <CardTitle sub={name ? `${name}, ${rows?.length} rows` : 'CSV file, up to 500 rows'}>2. Add applications</CardTitle>
          <input ref={file} type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
          <div className="flex flex-wrap gap-2">
            <Button kind="ghost" onClick={() => file.current?.click()}><Upload size={17} />Upload CSV</Button>
            <Button kind="quiet" onClick={() => { setRows(sampleBatch()); setName('Sample batch'); setOut(null); setErr('') }}>Use a sample batch</Button>
          </div>
        </Card>
        <Card>
          <CardTitle sub="Same model and rules as a single check">3. Score everything</CardTitle>
          <Button onClick={run} disabled={!rows || busy || Boolean(missing?.length)} className="w-full"><Play size={17} />{busy ? 'Scoring…' : rows ? `Score ${rows.length} applications` : 'Score applications'}</Button>
          {out && <Button kind="ghost" className="mt-2 w-full" onClick={exportResults}><Download size={17} />Download results</Button>}
        </Card>
      </div>

      {err && <div className="mt-4"><Notice tone="bad">{err}</Notice></div>}
      {missing && missing.length > 0 && <div className="mt-4"><Notice tone="bad">The file is missing these columns: {missing.join(', ')}.</Notice></div>}

      {rows && !out && (
        <Card className="mt-4 overflow-x-auto">
          <CardTitle sub="First 8 rows">Preview</CardTitle>
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead><tr className="text-muted">{['ref', 'income_annum', 'loan_amount', 'loan_term', 'cibil_score', 'existing_emi_monthly'].map((h) => <th key={h} className="border-b border-line py-2 pr-3 font-medium">{h}</th>)}</tr></thead>
            <tbody>{rows.slice(0, 8).map((r, i) => <tr key={i}>{['ref', 'income_annum', 'loan_amount', 'loan_term', 'cibil_score', 'existing_emi_monthly'].map((h) => <td key={h} className="border-b border-line-2 py-2 pr-3">{r[h]}</td>)}</tr>)}</tbody>
          </table>
        </Card>
      )}

      {out && (
        <>
          <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi label="Approve" value={out.summary.APPROVE} tone="text-ok" />
            <Kpi label="Refer" value={out.summary.REFER} tone="text-warn" />
            <Kpi label="Decline" value={out.summary.DECLINE} tone="text-bad" />
            <Kpi label="Rows with errors" value={out.summary.INVALID} sub="Reported, never dropped" />
          </div>
          <Card className="mt-4 overflow-x-auto">
            <div className="mb-3 flex flex-wrap gap-2">
              {(['all', 'APPROVE', 'REFER', 'DECLINE', 'INVALID'] as const).map((f) => (
                <button key={f} onClick={() => setFilter(f)} className={cx('min-h-9 rounded-full px-3 text-sm', filter === f ? 'bg-ink text-white' : 'border border-line text-muted')}>
                  {f === 'all' ? 'All' : f === 'INVALID' ? 'Errors' : f[0] + f.slice(1).toLowerCase()}
                </button>
              ))}
            </div>
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead><tr className="text-muted">{['Row', 'Ref', 'Result', 'Likelihood', 'EMI burden', 'New EMI', 'Main reason or error'].map((h) => <th key={h} className="border-b border-line py-2 pr-3 font-medium">{h}</th>)}</tr></thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.row} className="align-top">
                    <td className="border-b border-line-2 py-2.5 pr-3">{r.row}</td>
                    <td className="whitespace-nowrap border-b border-line-2 py-2.5 pr-3 font-mono text-[13px]">{r.ref}</td>
                    <td className="border-b border-line-2 py-2.5 pr-3">{r.valid ? <DecisionPill d={r.decision!} /> : <span className="rounded-full bg-bad-bg px-2.5 py-0.5 text-[13px] font-semibold text-bad">Error</span>}</td>
                    <td className="border-b border-line-2 py-2.5 pr-3">{r.valid ? pct(r.approval_probability!) : ''}</td>
                    <td className="border-b border-line-2 py-2.5 pr-3">{r.valid ? `${(r.foir! * 100).toFixed(0)}%` : ''}</td>
                    <td className="border-b border-line-2 py-2.5 pr-3">{r.valid ? inr(r.emi_estimate) : ''}</td>
                    <td className="border-b border-line-2 py-2.5 pr-3 text-muted">{r.valid ? r.reason : r.errors?.map((e) => `${e.field}: ${e.message}`).join('; ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}
    </>
  )
}
