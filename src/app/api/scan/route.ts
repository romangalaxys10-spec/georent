/**
 * /api/scan — trigger the scanner mini-service (server-side route handler).
 *
 * POST performs a server-side fetch to the scanner on localhost:3030 with a
 * 3s timeout. When the scanner is unreachable, timed out, or answers
 * non-2xx/non-JSON, this route answers 200 {ok:false, scanner:'down'} — that
 * is a graceful status for the UI, not an error. A healthy scanner's JSON
 * body is returned verbatim.
 */
import { NextResponse } from 'next/server'

const SCANNER_URL = 'http://localhost:3030/scan'
const SCANNER_TIMEOUT_MS = 3000

export async function POST() {
  try {
    const res = await fetch(SCANNER_URL, {
      method: 'POST',
      signal: AbortSignal.timeout(SCANNER_TIMEOUT_MS),
    })
    if (!res.ok) {
      return NextResponse.json({ ok: false, scanner: 'down' })
    }
    const body: unknown = await res.json()
    return NextResponse.json(body)
  } catch {
    // Connection refused, timeout, or non-JSON body → scanner considered down.
    return NextResponse.json({ ok: false, scanner: 'down' })
  }
}
