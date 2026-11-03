import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, SessionCost, SessionRateLimit } from 'claude-code'

import type { Burn } from '../types'
import { NO_BURN, THINGS, compare, lifetimeDelta, money, pct, resetsIn, windows } from './burn'

// Valent Partners palette (valentpartners.com).
const TEAL = '#40b5c7'
const NAVY = '#3a4596' // the site's #232b69, lifted to read on a dark terminal
const WHITE = '#f4f8f8'

// The full logo shows until /valent folds it to one line.
const isFull = atom({ plugin: 'valent', key: 'isBannerFull' } as const, true)
// Token burn: this session's spend and the plan's windows.
const burn = atom({ plugin: 'valent', key: 'burn' } as const, NO_BURN as Burn)

// The burrito / McDouble comparison turns over this often; nothing else moves.
const ROTATE_MS = 6000
// Wide enough for the burn readout beside the logo rather than under it.
const SIDE_BY_SIDE = 92

const THEME = 'custom:valent:valent'
const APPLIED = 'themeApplied'

// The VP shield: nested navy and teal chevrons. One char per pixel, '.' empty.
const BADGE = [
  'N.TT.NN.TT.N',
  'NN.TT..TT.NN',
  '.NN.TTTT.NN.',
  'T.NN.TT.NN.T',
  'TT.NN..NN.TT',
  '.TT.NNNN.TT.',
  'N.TT.NN.TT.N',
  'NN.TT..TT.NN',
  '.NN.TTTT.NN.',
  '..NN.TT.NN..',
  '...NN..NN...',
  '....NNNN....',
  '.....NN.....',
  '............',
]

const FONT: Record<string, string[]> = {
  V: ['W...W', 'W...W', 'W...W', '.W.W.', '..W..', '.....'],
  A: ['.WWW.', 'W...W', 'WWWWW', 'W...W', 'W...W', '.....'],
  L: ['W....', 'W....', 'W....', 'W....', 'WWWWW', '.....'],
  E: ['WWWWW', 'W....', 'WWWW.', 'W....', 'WWWWW', '.....'],
  N: ['W...W', 'WW..W', 'W.W.W', 'W..WW', 'W...W', '.....'],
  T: ['WWWWW', '..W..', '..W..', '..W..', '..W..', '.....'],
}
const WORD = [0, 1, 2, 3, 4, 5].map(row =>
  [...'VALENT'].map(letter => FONT[letter]![row]).join('.'),
)

const COLORS: Record<string, string> = { T: TEAL, N: NAVY, W: WHITE }

type Run = { text: string; color?: string; backgroundColor?: string }

/** Folds pixel rows in pairs into terminal rows of half-block runs. */
function toRows(grid: string[]): Run[][] {
  const rows: Run[][] = []
  for (let y = 0; y < grid.length; y += 2) {
    const runs: Run[] = []
    for (let x = 0; x < grid[y]!.length; x += 1) {
      const up = COLORS[grid[y]![x]!]
      const down = COLORS[grid[y + 1]?.[x] ?? '.']
      const cell: Run =
        up && down
          ? up === down
            ? { text: '█', color: up }
            : { text: '▀', color: up, backgroundColor: down }
          : up
            ? { text: '▀', color: up }
            : down
              ? { text: '▄', color: down }
              : { text: ' ' }
      const last = runs[runs.length - 1]
      if (last && last.color === cell.color && last.backgroundColor === cell.backgroundColor) {
        last.text += cell.text
      } else {
        runs.push(cell)
      }
    }
    rows.push(runs)
  }
  return rows
}

const badge = toRows(BADGE)
const word = toRows(WORD)
const PARTNERS = 'P   A   R   T   N   E   R   S'

type Reading = { sessionId: string; usd: number }
type Measure = { cost?: SessionCost; rateLimits: SessionRateLimit[] }

// Read once per load and kept here, so a measure costs one store write, not
// four store and session round trips. A reload starts them over from the store.
let sessionId: string | undefined
let lifetime: number | undefined
let last: Reading | null = null
// Measures are folded one at a time, so two close together cannot double-count.
let folding: Promise<void> = Promise.resolve()

/** Folds a measure (pushed by the engine, or read once at start) into the burn. */
function foldMeasure($: EngineInterface, measure: Measure) {
  folding = folding.then(async () => {
    if (sessionId === undefined) {
      sessionId = await $.session.id()
      last = ((await $.store.get(`last:${sessionId}`)) ?? null) as Reading | null
      lifetime = Number((await $.store.get('lifetime')) ?? 0)
    }
    const usd = measure.cost?.usd ?? 0
    const delta = lifetimeDelta(last, sessionId, usd)
    if (delta !== 0 || !last) {
      lifetime = (lifetime ?? 0) + delta
      last = { sessionId, usd }
      await $.store.set('lifetime', lifetime)
      await $.store.set(`last:${sessionId}`, last)
    }
    const fresh: Burn = { usd, lifetime: lifetime ?? 0, ...windows(measure.rateLimits) }
    const now = await read($, burn)
    if (JSON.stringify(now) !== JSON.stringify(fresh)) await update($, burn, () => fresh)
  }).catch(() => undefined)
  return folding
}

// Which comparison shows: stepped by the rotation timer, read by the drawing.
let which = 0

export const register: Register = on => {
  let rotation: { cancel: () => void } | undefined

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'valent',
      description: 'Show or fold the Valent banner; `/valent theme` re-applies the Valent colors',
      argumentHint: '[theme]',
    })
    // Switch to the Valent theme once; a later pick in /theme is respected.
    if (!(await $.store.get(APPLIED))) {
      const { deny } = await $.config.set({ key: 'theme', value: THEME })
      if (!deny) await $.store.set(APPLIED, true)
    }
    void $.session.usage().then(usage => foldMeasure($, usage), () => undefined)
    rotation?.cancel()
    rotation = $.clock.every(ROTATE_MS, () => {
      which = (which + 1) % THINGS.length
      // At $0.00 every comparison reads 0.00: skip the redraw.
      void read($, burn).then(b => b.usd > 0 && $.ui.invalidate('ui.render'))
    })
    return next(e)
  })

  // The engine pushes each measure with its figures: no usage call needed.
  on('session.measure', ($, e, next) => {
    void foldMeasure($, e)
    return next(e)
  })

  on('command.run', { command: 'valent' }, async ($, e) => {
    if (e.args.trim() === 'theme') {
      const { deny } = await $.config.set({ key: 'theme', value: THEME })
      return { text: deny ? `Could not set the Valent theme: ${deny}` : 'Valent theme applied.' }
    }
    const now = await update($, isFull, value => !value)
    return { text: now ? 'Valent banner shown.' : 'Valent banner folded.' }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const { Box, Text } = $.ui.resolve(e)
    const [b, isFullNow] = await Promise.all([read($, burn), read($, isFull)])
    const cols = e.props.bodyColumns
    const full = isFullNow && cols >= 52 && e.props.maxRows >= 8

    const spend = (
      <Text key="m-usd">
        <Text bold color={WHITE}>{money(b.usd)}</Text>
        <Text color={TEAL}>{` ${compare(b.usd, which)}`}</Text>
      </Text>
    )

    if (!full) {
      const limits = [b.session >= 0 ? `5h ${pct(b.session)}` : '', b.week >= 0 ? `wk ${pct(b.week)}` : '']
        .filter(Boolean)
        .join(' · ')
      return (
        <Box gap={3}>
          <Box>
            <Text color={TEAL}>◤</Text>
            <Text color={NAVY}>◥ </Text>
            <Text bold color={WHITE}>VALENT </Text>
            <Text color={TEAL}>PARTNERS</Text>
          </Box>
          {spend}
          {limits ? <Text dimColor>{limits}</Text> : null}
        </Box>
      )
    }

    /** One limit window: label, a still bar, percent, reset. */
    const limitRow = (label: string, percent: number, resets: string) => {
      const width = 12
      const filled = Math.round((Math.max(0, Math.min(100, percent)) / 100) * width)
      const isHot = percent >= 80
      return (
        <Text key={`m-${label}`}>
          <Text color={TEAL}>{`${label}  `}</Text>
          <Text color={isHot ? WHITE : TEAL}>{'█'.repeat(filled)}</Text>
          <Text color={NAVY}>{'░'.repeat(width - filled)}</Text>
          <Text bold={isHot} color={WHITE}>{` ${pct(percent)} `}</Text>
          <Text dimColor>{resetsIn(resets, Date.now())}</Text>
        </Text>
      )
    }

    const metrics = [
      <Text key="m-title" bold color={TEAL}>TOKEN BURN</Text>,
      spend,
      b.session >= 0 ? limitRow('5h', b.session, b.sessionResets) : null,
      b.week >= 0 ? limitRow('wk', b.week, b.weekResets) : null,
      <Text key="m-life" dimColor>{`lifetime ${money(b.lifetime)}`}</Text>,
    ].filter(row => row !== null)

    const right: (Run[] | string | null)[] = [null, ...word, null, PARTNERS, null]
    const logo = badge.map((runs, i) => {
      const side = right[i]
      return (
        <Box key={`row${i}`}>
          {runs.map((run, j) => (
            <Text key={`b${j}`} color={run.color} backgroundColor={run.backgroundColor}>
              {run.text}
            </Text>
          ))}
          <Text>{'   '}</Text>
          {typeof side === 'string' ? (
            <Text color={TEAL}>{side}</Text>
          ) : (
            side?.map((run, j) => (
              <Text key={`w${j}`} color={run.color} backgroundColor={run.backgroundColor}>
                {run.text}
              </Text>
            ))
          )}
        </Box>
      )
    })

    return cols >= SIDE_BY_SIDE ? (
      <Box gap={4}>
        <Box flexDirection="column">{logo}</Box>
        <Box flexDirection="column" paddingTop={1}>{metrics}</Box>
      </Box>
    ) : (
      <Box flexDirection="column">
        {logo}
        {metrics}
      </Box>
    )
  })
}
