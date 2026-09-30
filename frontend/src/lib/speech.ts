import { useCallback, useEffect, useRef, useState } from 'react'
import type { Lang } from './types'

// Free, in-browser voice: Web Speech API for listening (Chrome, Edge, Safari) and speechSynthesis for reading aloud.
const SR: any = typeof window !== 'undefined' && ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition)
const LOCALE: Record<Lang, string> = { en: 'en-IN', hi: 'hi-IN' }

export function useVoiceInput(lang: Lang, onFinal: (text: string) => void) {
  const [listening, setListening] = useState(false)
  const [interim, setInterim] = useState('')
  const rec = useRef<any>(null)
  const supported = Boolean(SR)

  const stop = useCallback(() => { rec.current?.stop(); setListening(false) }, [])
  const start = useCallback(() => {
    if (!SR) return
    const r = new SR()
    r.lang = LOCALE[lang]; r.interimResults = true; r.maxAlternatives = 1
    r.onresult = (e: any) => {
      let fin = '', mid = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript
        if (e.results[i].isFinal) fin += t; else mid += t
      }
      setInterim(mid)
      if (fin.trim()) { setInterim(''); onFinal(fin.trim()) }
    }
    r.onend = () => { setListening(false); setInterim('') }
    r.onerror = () => { setListening(false); setInterim('') }
    rec.current = r
    r.start(); setListening(true)
  }, [lang, onFinal])
  useEffect(() => () => rec.current?.abort?.(), [])
  return { supported, listening, interim, start, stop }
}

export function speak(text: string, lang: Lang, onEnd?: () => void) {
  if (!('speechSynthesis' in window)) return false
  window.speechSynthesis.cancel()
  const u = new SpeechSynthesisUtterance(text.replace(/\[\d\]/g, ''))
  u.lang = LOCALE[lang]
  const voice = window.speechSynthesis.getVoices().find((v) => v.lang === LOCALE[lang]) ||
    window.speechSynthesis.getVoices().find((v) => v.lang.startsWith(lang))
  if (voice) u.voice = voice
  u.rate = 1
  if (onEnd) u.onend = onEnd
  window.speechSynthesis.speak(u)
  return true
}
export const stopSpeaking = () => { if ('speechSynthesis' in window) window.speechSynthesis.cancel() }
export const canSpeak = () => typeof window !== 'undefined' && 'speechSynthesis' in window
