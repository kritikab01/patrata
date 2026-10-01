import { useCallback, useEffect, useRef, useState } from 'react'
import { Bot, Send, Volume2, VolumeX } from 'lucide-react'
import { api } from '../lib/api'
import type { ChatMsg, Lang } from '../lib/types'
import { canSpeak, speak, stopSpeaking, useVoiceInput } from '../lib/speech'
import { Button, Card, cx, LangSwitch, MicButton, PageHead, Skeleton } from '../components/ui'

const SUGGEST: Record<Lang, string[]> = {
  en: ['EMI for ₹10 lakh at 11% for 5 years?', 'How much can I borrow on ₹60,000 a month?', 'I earn ₹50,000 a month, CIBIL 720. Can I get ₹8 lakh for 5 years?',
    'How can I improve my CIBIL score?', 'Fixed or floating rate, which is better?', 'What documents do I need for a home loan?',
    'I have no credit history. Can I get a loan?', 'Is any personal data sent to the AI?'],
  hi: ['10 लाख के लोन की EMI 5 साल के लिए कितनी होगी?', 'FOIR क्या है?', 'कितना CIBIL स्कोर चाहिए?', 'क्या AI को निजी जानकारी भेजी जाती है?'],
}
const pretty = (k: string) => {
  const t = k.replace(/_/g, ' ').replace(/\bemis?\b/g, (m) => m.toUpperCase()).replace(/\bcibil\b/g, 'CIBIL')
  return t[0].toUpperCase() + t.slice(1)
}
const KIND: Record<string, string> = {
  grounded: "From Patrata's notes", general: 'General guidance from the AI. Not financial advice',
  calculator: 'Calculated by Patrata', guard: 'Outside what I can help with',
}

export default function Assistant() {
  const [lang, setLang] = useState<Lang>('en')
  const [msgs, setMsgs] = useState<ChatMsg[]>(() => {
    try { return JSON.parse(sessionStorage.getItem('patrata-chat') || '[]') } catch { return [] }
  })
  const [q, setQ] = useState('')
  const [wait, setWait] = useState(false)
  const [voiceOut, setVoiceOut] = useState(false)
  const end = useRef<HTMLDivElement>(null)

  useEffect(() => { try { sessionStorage.setItem('patrata-chat', JSON.stringify(msgs.slice(-30))) } catch { /* ignore */ } ; end.current?.scrollIntoView({ block: 'end', behavior: 'smooth' }) }, [msgs])
  useEffect(() => () => stopSpeaking(), [])

  const send = useCallback(async (text: string) => {
    text = text.trim(); if (text.length < 2 || wait) return
    const history = msgs.slice(-6).map(({ role, content }) => ({ role, content }))
    setQ(''); setMsgs((m) => [...m, { role: 'user', content: text }]); setWait(true)
    try {
      const r = await api<{ answer: string; sources: ChatMsg['sources']; source: string; kind: ChatMsg['kind']; calc: ChatMsg['calc'] }>('/assistant', { json: { question: text, language: lang, history } })
      setMsgs((m) => [...m, { role: 'assistant', content: r.answer, sources: r.sources, source: r.source, kind: r.kind, calc: r.calc }])
      if (voiceOut) speak(r.answer, lang)
    } catch {
      setMsgs((m) => [...m, { role: 'assistant', content: "I couldn't answer just now. Try again in a moment.", source: 'error' }])
    } finally { setWait(false) }
  }, [msgs, lang, wait, voiceOut])
  const voice = useVoiceInput(lang, send)

  return (
    <>
      <PageHead title="Patrata Assistant" sub="Loans, EMIs, CIBIL, documents, interest rates, RBI rules and how Patrata decides. Calculations are done in code, and every answer shows where it came from."
        right={<div className="flex items-center gap-2">
          {canSpeak() && <button type="button" onClick={() => { setVoiceOut(!voiceOut); stopSpeaking() }} aria-pressed={voiceOut}
            className={cx('flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm', voiceOut ? 'border-ink bg-ink text-white' : 'border-field bg-white')}>
            {voiceOut ? <Volume2 size={16} /> : <VolumeX size={16} />}Read answers aloud</button>}
          <LangSwitch lang={lang} onChange={(l) => { setLang(l); stopSpeaking() }} />
        </div>} />

      <Card className="flex min-h-[60vh] flex-col p-0 sm:p-0">
        <div className="flex-1 space-y-4 overflow-y-auto p-5 sm:p-6" aria-live="polite">
          {!msgs.length && (
            <div className="py-6 text-center">
              <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-sky text-ink"><Bot size={28} /></div>
              <p className="mt-3 text-lg font-semibold">How can I help?</p>
              <p className="mx-auto max-w-md text-muted">Type or tap the microphone to speak. Ask about loans, EMIs, CIBIL, documents or interest rates. I can calculate EMIs and how much you can borrow, and run a quick eligibility pre-check. I can't make or change credit decisions.</p>
              <div className="mx-auto mt-5 flex max-w-2xl flex-wrap justify-center gap-2">
                {SUGGEST[lang].map((s) => <button key={s} onClick={() => send(s)} className="min-h-10 rounded-full border border-field bg-white px-4 text-sm hover:border-ink">{s}</button>)}
              </div>
            </div>
          )}
          {msgs.map((m, i) => (
            <div key={i} className={cx('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
              <div className={cx('max-w-[88%] rounded-2xl px-4 py-3 sm:max-w-[75%]', m.role === 'user' ? 'rounded-br-md bg-ink text-white' : 'rounded-bl-md border border-line bg-white')}>
                <p className="whitespace-pre-line leading-relaxed">{m.content}</p>
                {m.role === 'assistant' && m.calc && m.calc.tool && (
                  <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-xl bg-paper p-3 text-[13px]">
                    {Object.entries(m.calc).filter(([k]) => !['tool', 'note', 'rule_used'].includes(k)).map(([k, v]) => (
                      <div key={k} className="contents"><dt className="text-muted">{pretty(k)}</dt><dd className="font-semibold">{String(v)}</dd></div>
                    ))}
                  </dl>
                )}
                {m.role === 'assistant' && m.kind && (
                  <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[12px] text-muted">
                    <span className={cx('rounded-md px-1.5 py-0.5 font-medium', m.kind === 'calculator' ? 'bg-ok-bg text-ok' : m.kind === 'general' ? 'bg-warn-bg text-warn' : m.kind === 'guard' ? 'bg-paper' : 'bg-sky text-ink')}>{KIND[m.kind]}</span>
                    {m.sources?.map((s) => <span key={s.n} className="rounded-md bg-paper px-1.5 py-0.5">[{s.n}] {s.title}</span>)}
                    {m.source === 'retrieval' && <span>(quoted directly; AI unavailable)</span>}
                  </div>
                )}
              </div>
            </div>
          ))}
          {wait && <Skeleton className="h-12 w-56 rounded-2xl" />}
          <div ref={end} />
        </div>
        <form className="flex gap-2 border-t border-line p-3 sm:p-4" onSubmit={(e) => { e.preventDefault(); send(q) }}>
          <label htmlFor="aq" className="sr-only">Your question</label>
          <input id="aq" value={voice.listening ? voice.interim || 'Listening…' : q} onChange={(e) => setQ(e.target.value)}
            placeholder={lang === 'hi' ? 'अपना सवाल लिखें' : 'Ask a question'} className="h-12 min-w-0 flex-1 rounded-xl border border-field px-4 outline-none focus:border-ink" />
          <MicButton supported={voice.supported} listening={voice.listening} onStart={voice.start} onStop={voice.stop} />
          <Button type="submit" disabled={wait} aria-label="Send"><Send size={18} /></Button>
        </form>
      </Card>
      {msgs.length > 0 && <button className="mt-3 text-sm text-muted underline" onClick={() => { setMsgs([]); stopSpeaking() }}>Clear conversation</button>}
    </>
  )
}
