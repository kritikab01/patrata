import type { Decision } from './types'

const nf = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 })
export const inr = (n: number | null | undefined) => (n == null ? '—' : '₹' + nf.format(Math.round(n)))
export const inrShort = (n: number) => {
  if (n >= 1e7) return `₹${+(n / 1e7).toFixed(2)} Cr`
  if (n >= 1e5) return `₹${+(n / 1e5).toFixed(1)} L`
  return inr(n)
}
export const pct = (p: number | null) => (p == null ? 'Not scored' : p >= 0.9995 ? '>99.9%' : p <= 0.0005 ? '<0.1%' : `${(p * 100).toFixed(1)}%`)
export const pct0 = (p: number) => `${Math.round(p * 100)}%`
export const when = (iso: string) =>
  new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
export const dayLabel = (iso: string) => new Date(iso + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
export function ago(iso: string) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)} min ago`
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`
  return `${Math.floor(s / 86400)} d ago`
}
export const WORD: Record<Decision, string> = { APPROVE: 'Approved', REFER: 'Referred to a credit officer', DECLINE: 'Declined' }
export const SHORT: Record<Decision, string> = { APPROVE: 'Approve', REFER: 'Refer', DECLINE: 'Decline' }
export const STAMP: Record<Decision, string> = { APPROVE: 'APPROVED', REFER: 'REFERRED', DECLINE: 'DECLINED' }
export const TONE: Record<Decision, { text: string; bg: string; border: string; hex: string }> = {
  APPROVE: { text: 'text-ok', bg: 'bg-ok-bg', border: 'border-ok', hex: '#047857' },
  REFER: { text: 'text-warn', bg: 'bg-warn-bg', border: 'border-warn-ink', hex: '#E0A33A' },
  DECLINE: { text: 'text-bad', bg: 'bg-bad-bg', border: 'border-bad', hex: '#B42318' },
}
