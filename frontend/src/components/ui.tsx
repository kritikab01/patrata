import { type ReactNode, useEffect, useState } from 'react'
import { AlertTriangle, Info, Mic, MicOff } from 'lucide-react'
import type { Decision, Lang } from '../lib/types'
import { SHORT, STAMP, TONE } from '../lib/format'

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ')

export function Card({ children, className = '', as: As = 'section', ...rest }: { children: ReactNode; className?: string; as?: any; [k: string]: any }) {
  return <As className={cx('rounded-[14px] border border-line bg-white p-5 sm:p-6', className)} {...rest}>{children}</As>
}

export function CardTitle({ children, right, sub }: { children: ReactNode; right?: ReactNode; sub?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="text-[17px] font-semibold leading-snug">{children}</h2>
        {sub && <p className="mt-0.5 text-sm text-muted">{sub}</p>}
      </div>
      {right}
    </div>
  )
}

type BtnKind = 'primary' | 'dark' | 'ghost' | 'quiet' | 'danger' | 'ok'
export function Button({ kind = 'primary', className = '', children, ...rest }: { kind?: BtnKind; className?: string; children: ReactNode } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const k: Record<BtnKind, string> = {
    primary: 'bg-brand text-white hover:bg-brand-2',
    dark: 'bg-ink text-white hover:bg-ink-2',
    ghost: 'border border-ink bg-white text-ink hover:bg-paper',
    quiet: 'bg-transparent text-ink hover:bg-paper',
    danger: 'bg-bad text-white hover:brightness-95',
    ok: 'bg-ok text-white hover:brightness-95',
  }
  return (
    <button className={cx('inline-flex min-h-11 items-center justify-center gap-2 rounded-[10px] px-4 font-semibold transition disabled:cursor-progress disabled:opacity-60', k[kind], className)} {...rest}>
      {children}
    </button>
  )
}

export function DecisionPill({ d, label }: { d: Decision; label?: string }) {
  const t = TONE[d]
  return <span className={cx('inline-flex items-center rounded-full px-2.5 py-0.5 text-[13px] font-semibold', t.bg, t.text)}>{label || SHORT[d]}</span>
}

export function StatusPill({ status }: { status: string }) {
  const tone = status.startsWith('Approved') || status === 'Pre-approved' ? 'bg-ok-bg text-ok'
    : status.startsWith('Declined') ? 'bg-bad-bg text-bad' : 'bg-warn-bg text-warn'
  return <span className={cx('inline-flex items-center rounded-full px-2.5 py-0.5 text-[13px] font-medium', tone)}>{status}</span>
}

export function CheckPill({ s }: { s: 'pass' | 'refer' | 'fail' }) {
  // Vault-style ledger marker: filled square = pass, outline = review, cross = fail. Text always shown.
  const m = { pass: ['Pass', 'text-ink'], refer: ['Review', 'text-warn'], fail: ['Fail', 'text-bad'] }[s]
  return (
    <span className={cx('inline-flex w-[76px] items-center gap-2 text-[13px] font-semibold', m[1])}>
      {s === 'pass' ? <i className="block h-2.5 w-2.5 bg-ink" /> : s === 'refer' ? <i className="block h-2.5 w-2.5 border-2 border-warn" /> :
        <svg width="11" height="11" viewBox="0 0 12 12" aria-hidden="true"><path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="2.4" /></svg>}
      {m[0]}
    </span>
  )
}

export function StatusIcon({ d, size = 56 }: { d: Decision; size?: number }) {
  // UPI-style status circle: a check, a clock or a cross, never colour alone.
  const c = { APPROVE: '#047857', REFER: '#B45309', DECLINE: '#B42318' }[d]
  return (
    <span className="grid shrink-0 place-items-center rounded-full bg-white" style={{ width: size, height: size }} aria-hidden="true">
      <svg width={size * 0.5} height={size * 0.5} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        {d === 'APPROVE' ? <path d="M5 12.5l4.5 4.5L19 7.5" /> : d === 'REFER' ? <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></> : <path d="M6 6l12 12M18 6L6 18" />}
      </svg>
    </span>
  )
}

export function SampleBadge() {
  return <span className="rounded border border-line px-1.5 py-0.5 text-[11px] font-medium text-muted" title="Generated sample data for the demo">Sample</span>
}

export function Notice({ tone = 'warn', title, children }: { tone?: 'warn' | 'info' | 'bad'; title?: ReactNode; children: ReactNode }) {
  const t = { warn: 'bg-warn-bg border-warn-line text-[#6B3A04]', info: 'bg-sky border-[#C9D3EE] text-ink', bad: 'bg-bad-bg border-[#F2B8B2] text-bad' }[tone]
  const Icon = tone === 'info' ? Info : AlertTriangle
  return (
    <div className={cx('flex gap-3 rounded-xl border px-4 py-3 text-sm leading-relaxed', t)} role="note">
      <Icon size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
      <p>{title && <b className="font-semibold">{title} </b>}{children}</p>
    </div>
  )
}

export function Skeleton({ className = 'h-4 w-full' }: { className?: string }) {
  return <div className={cx('skeleton', className)} />
}

export function Bar({ value, className = 'bg-ink', label }: { value: number; className?: string; label?: string }) {
  return (
    <div className="h-2 overflow-hidden rounded-full bg-line-2" role="img" aria-label={label}>
      <div className={cx('h-full rounded-full transition-[width] duration-500', className)} style={{ width: `${Math.max(1, Math.min(100, value * 100))}%` }} />
    </div>
  )
}

/** EMI-burden meter with the policy bands drawn on it: clear up to 50%, review to 65%, decline above. */
export function FoirMeter({ foir }: { foir: number }) {
  const max = 1.0
  const pos = Math.min(foir, max) / max * 100
  const tone = foir > 0.65 ? 'text-bad' : foir > 0.5 ? 'text-warn' : 'text-ok'
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="text-sm text-muted">EMI burden (FOIR)</span>
        <b className={cx('text-lg', tone)}>{(foir * 100).toFixed(1)}%</b>
      </div>
      <div className="relative h-3 rounded-full" role="img" aria-label={`EMI burden ${(foir * 100).toFixed(1)} percent`}
        style={{ background: 'linear-gradient(90deg,#CFE7D8 0 50%,#F6DDB4 50% 65%,#F4C4BE 65% 100%)' }}>
        <div className="absolute top-1/2 h-5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-ink shadow transition-[left] duration-500" style={{ left: `${pos}%` }} />
      </div>
      <div className="relative mt-1 h-4 text-[11px] text-muted">
        <span className="absolute" style={{ left: '50%', transform: 'translateX(-50%)' }}>50%</span>
        <span className="absolute" style={{ left: '65%', transform: 'translateX(-50%)' }}>65%</span>
      </div>
    </div>
  )
}

export function CibilMeter({ score }: { score: number }) {
  const pos = (Math.min(900, Math.max(300, score)) - 300) / 600 * 100
  const tone = score >= 700 ? 'text-ok' : score >= 600 ? 'text-warn' : 'text-bad'
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="text-sm text-muted">CIBIL band</span>
        <b className={cx('text-lg', tone)}>{score} <span className="text-sm font-medium">({score >= 700 ? 'clear' : score >= 600 ? 'review' : 'below floor'})</span></b>
      </div>
      <div className="relative h-3 rounded-full" style={{ background: 'linear-gradient(90deg,#F4C4BE 0 50%,#F6DDB4 50% 66.7%,#CFE7D8 66.7% 100%)' }}>
        <div className="absolute top-1/2 h-5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-ink shadow transition-[left] duration-500" style={{ left: `${pos}%` }} />
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-muted"><span>300</span><span>600</span><span>700</span><span>900</span></div>
    </div>
  )
}

export function LangSwitch({ lang, onChange }: { lang: Lang; onChange: (l: Lang) => void }) {
  return (
    <div role="group" aria-label="Language" className="flex overflow-hidden rounded-lg border border-field">
      {(['en', 'hi'] as Lang[]).map((l) => (
        <button key={l} type="button" lang={l} aria-pressed={lang === l} onClick={() => onChange(l)}
          className={cx('h-9 min-w-14 px-3 text-sm', lang === l ? 'bg-ink font-semibold text-white' : 'bg-white')}>
          {l === 'en' ? 'EN' : 'हिंदी'}
        </button>
      ))}
    </div>
  )
}

export function MicButton({ supported, listening, onStart, onStop }: { supported: boolean; listening: boolean; onStart: () => void; onStop: () => void }) {
  if (!supported) return null
  return (
    <button type="button" onClick={listening ? onStop : onStart} aria-label={listening ? 'Stop listening' : 'Speak your question'}
      className={cx('grid h-11 w-11 shrink-0 place-items-center rounded-xl border', listening ? 'border-bad bg-bad-bg text-bad' : 'border-field bg-white text-ink hover:border-ink')}>
      {listening ? <MicOff size={18} /> : <Mic size={18} />}
    </button>
  )
}

export function useDebounced<T>(value: T, ms = 350) {
  const [v, setV] = useState(value)
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t) }, [value, ms])
  return v
}

export function Kpi({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: string }) {
  return (
    <div className="rounded-[4px] border border-line border-t-ink bg-white p-4 sm:p-5" style={{ borderTopWidth: 3 }}>
      <p className="text-sm text-muted">{label}</p>
      <p className={cx('mt-1 font-display text-[30px] font-extrabold leading-tight tracking-tight', tone)}>{value}</p>
      {sub && <p className="mt-1 text-[13px] text-muted">{sub}</p>}
    </div>
  )
}

export function PageHead({ title, sub, right }: { title: ReactNode; sub?: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-[28px] font-extrabold leading-tight tracking-tight sm:text-[34px]">{title}</h1>
        {sub && <p className="mt-1 max-w-2xl text-muted">{sub}</p>}
      </div>
      {right}
    </div>
  )
}
