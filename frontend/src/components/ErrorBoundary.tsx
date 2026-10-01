import { Component, type ReactNode } from 'react'

/** If any screen crashes, show a way out instead of a blank page. */
export default class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }
  static getDerivedStateFromError(error: Error) { return { error } }
  reset = () => {
    try {
      for (const store of [localStorage, sessionStorage])
        Object.keys(store).filter((k) => k.startsWith('patrata')).forEach((k) => store.removeItem(k))
    } catch { /* storage unavailable */ }
    window.location.assign('/')
  }
  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="mx-auto mt-16 max-w-md rounded-[14px] border border-ink bg-white p-6 text-center">
        <p className="font-display text-xl font-extrabold">Something went wrong on this screen</p>
        <p className="mt-2 text-muted">Saved data from an older version can cause this. Resetting clears only Patrata's saved form drafts in this browser.</p>
        <button type="button" onClick={this.reset} className="mt-5 min-h-11 w-full rounded-[10px] bg-ink px-4 font-semibold text-white">Reset and reload</button>
      </div>
    )
  }
}
