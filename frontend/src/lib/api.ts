export class ApiError extends Error {
  status: number
  body: any
  constructor(message: string, status: number, body: any) { super(message); this.status = status; this.body = body }
}

export async function api<T = any>(path: string, opts: { method?: string; json?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  const res = await fetch('/api' + path, {
    method: opts.method || (opts.json !== undefined ? 'POST' : 'GET'),
    headers: { 'content-type': 'application/json' },
    body: opts.json !== undefined ? JSON.stringify(opts.json) : undefined,
    signal: opts.signal,
  })
  let body: any = null
  try { body = await res.json() } catch { /* empty body */ }
  if (!res.ok) throw new ApiError(body?.detail || `Request failed (${res.status})`, res.status, body)
  return body as T
}

export const newRequestId = () =>
  (crypto.randomUUID ? crypto.randomUUID() : `r${Date.now()}${Math.random().toString(16).slice(2)}`).replace(/-/g, '')
