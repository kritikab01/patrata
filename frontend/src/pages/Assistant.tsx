import { useCallback, useEffect, useRef, useState } from 'react'
import { Bot, Send, Volume2, VolumeX } from 'lucide-react'
import { api } from '../lib/api'
import type { ChatMsg, Lang } from '../lib/types'
import { canSpeak, speak, stopSpeaking, useVoiceInput } from '../lib/speech'
import { Button, Card, cx, LangSwitch, MicButton, PageHead, Skeleton } from '../components/ui'

const SUGGEST: Record<Lang, string[]> = {
  en: ['What is FOIR?', 'What CIBIL score is needed?', 'Why is the accuracy so high?', 'Is any personal data sent to the AI?', 'Who is accountable if a decision is wrong?', 'What are the RBI digital lending rules?'],
  hi: ['FOIR क्या है?', 'कितना CIBIL स्कोर चाहिए?', 'क्या AI को निजी जानकारी भेजी जाती है?', 'गलत निर्णय की ज़िम्मेदारी किसकी है?'],
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
      const r = await api<{ answer: string; sources: ChatMsg['sources']; source: string }>('/assistant', { json: { question: text, language: lang, history } })
      setMsgs((m) => [...m, { role: 'assistant', content: r.answer, sources: r.sources, source: r.source }])
      if (voiceOut) speak(r.answer, lang)
    } catch {
      setMsgs((m) => [...m, { role: 'assistant', content: "I couldn't answer just now. Try again in a moment.", source: 'error' }])
    } finally { setWait(false) }
  }, [msgs, lang, wait, voiceOut])
  const voice = useVoiceInput(lang, send)

  return (
    <>
      <PageHead title="Patrata Assistant" sub="Ask about lending policy, CIBIL, EMI burden, privacy or how Patrata decides. Answers come from Patrata's policy notes and show their sources."
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
              <p className="mx-auto max-w-md text-muted">Type or tap the microphone to speak. I answer only about lending policy and this app, and I can't make or change credit decisions.</p>
              <div className="mx-auto mt-5 flex max-w-2xl flex-wrap justify-center gap-2">
                {SUGGEST[lang].map((s) => <button key={s} onClick={() => send(s)} className="min-h-10 rounded-full border border-field bg-white px-4 text-sm hover:border-ink">{s}</button>)}
              </div>
            </div>
          )}
          {msgs.map((m, i) => (
            <div key={i} className={cx('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
              <div className={cx('max-w-[88%] rounded-2xl px-4 py-3 sm:max-w-[75%]', m.role === 'user' ? 'rounded-br-md bg-ink text-white' : 'rounded-bl-md border border-line bg-white')}>
                <p className="whitespace-pre-line leading-relaxed">{m.content}</p>
                {m.role === 'assistant' && (m.sources?.length || m.source === 'guard') && (
                  <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[12px] text-muted">
                    {m.source === 'guard' ? <span>Outside what I can help with</span> : <>
                      <span>Sources:</span>
                      {m.sources!.map((s) => <span key={s.n} className="rounded-md bg-paper px-1.5 py-0.5">[{s.n}] {s.title}</span>)}
                      {m.source === 'retrieval' && <span>(quoted directly, AI unavailable)</span>}
                    </>}
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
