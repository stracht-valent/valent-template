/** Pure helpers for the token burn readout: money, comparisons and limit windows. */

import type { SessionRateLimit } from 'claude-code'
import type { Burn } from '../types'

type Thing = { one: string; many: string; usd: number }

/** What the spend buys instead; the banner rotates through them. */
export const THINGS: readonly Thing[] = [
  { one: 'burrito', many: 'burritos', usd: 11 },
  { one: 'McDouble', many: 'McDoubles', usd: 3.19 },
]

export const NO_BURN: Burn = { usd: 0, lifetime: 0, session: -1, week: -1, sessionResets: '', weekResets: '' }

/** `$12.34`, or four decimals under a cent so the first fractions still show. */
export const money = (usd: number) => '$' + (usd > 0 && usd < 0.01 ? usd.toFixed(4) : usd.toFixed(2))

/** `= 1.4 burritos` for the thing at `index`, wrapping. */
export const compare = (usd: number, index: number) => {
  const thing = THINGS[((index % THINGS.length) + THINGS.length) % THINGS.length]!
  const count = usd / thing.usd
  const shown = count >= 10 ? count.toFixed(0) : count >= 1 ? count.toFixed(1) : count.toFixed(2)
  return `= ${shown} ${shown === '1.0' || shown === '1' ? thing.one : thing.many}`
}

/** The 5-hour and 7-day subscription windows; -1 where the plan has none. */
export const windows = (limits: readonly SessionRateLimit[]) => {
  const s = limits.find(l => l.kind === 'five_hour')
  const w = limits.find(l => l.kind === 'seven_day')
  return {
    session: s ? s.percentUsed : -1,
    week: w ? w.percentUsed : -1,
    sessionResets: s?.resetsAt ?? '',
    weekResets: w?.resetsAt ?? '',
  }
}

/** `in 2h 14m`, `in 3d 4h`, `now`; '' when unknown. */
export const resetsIn = (iso: string, now: number) => {
  if (!iso) return ''
  const ms = Date.parse(iso) - now
  if (!Number.isFinite(ms)) return ''
  if (ms <= 0) return 'now'
  const m = Math.floor(ms / 60_000)
  const d = Math.floor(m / 1440)
  const h = Math.floor((m % 1440) / 60)
  return d > 0 ? `in ${d}d ${h}h` : h > 0 ? `in ${h}h ${m % 60}m` : `in ${m}m`
}

/** `42%`, or `--` with no reading. */
export const pct = (n: number) => (n < 0 ? '--' : `${Math.round(n)}%`)

/** How much to add to the lifetime total for a new reading of this session. */
export const lifetimeDelta = (last: { sessionId: string; usd: number } | null, sessionId: string, usd: number) => {
  const before = last && last.sessionId === sessionId ? last.usd : 0
  return usd >= before ? usd - before : usd
}
