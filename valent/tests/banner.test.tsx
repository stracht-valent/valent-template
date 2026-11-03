import { expect, mock, test } from 'claude-code/testing'

const BAND = {
  plugin: 'valent',
  component: 'AbovePrompt',
  surface: 'terminal',
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 40,
    bodyColumns: 100,
    scroll: { offset: 0, bodyRows: 39 },
    view: {},
  },
} as const

// /valent as typed at the prompt.
const VALENT = {
  command: 'valent',
  args: '',
  origin: { kind: 'composer' },
  presentation: { isFullscreen: false, columns: 100 },
} as const

test('the full banner draws at session start', async ($, on) => {
  const ui = await $.ui.mount(BAND)
  expect((await ui.find({ type: 'Text', text: /P   A   R/ }))?.text).toBe('P   A   R   T   N   E   R   S')
  await ui.unmount()
})

test('/valent folds it to one line and back', async ($, on) => {
  on('command.register', () => ({ value: { command: 'valent' } }))
  await $.command.run(VALENT)
  let ui = await $.ui.mount(BAND)
  expect((await ui.find({ type: 'Text', text: /PARTNERS/ }))?.text).toBe('PARTNERS')
  await ui.unmount()
  await $.command.run(VALENT)
  ui = await $.ui.mount(BAND)
  expect(await ui.find({ type: 'Text', text: /P   A   R/ })).toBeTruthy()
  await ui.unmount()
})

test('the banner shows the burn, limits and a burrito comparison', async ($, on) => {
  on('state.get', (_, e) =>
    e.key === 'burn'
      ? { value: { value: { usd: 22, lifetime: 40, session: 42, week: 12, sessionResets: '', weekResets: '' }, version: 1 } }
      : { value: { value: undefined, version: 0 } },
  )
  const ui = await $.ui.mount(BAND)
  expect((await ui.find({ type: 'Text', text: /TOKEN BURN/ }))?.text).toBe('TOKEN BURN')
  expect((await ui.find({ type: 'Text', text: /\$22\.00/ }))?.text).toBe('$22.00 = 2.0 burritos')
  expect(await ui.find({ type: 'Text', text: /42%/ })).toBeTruthy()
  expect((await ui.find({ type: 'Text', text: /lifetime/ }))?.text).toBe('lifetime $40.00')
  await ui.unmount()
})

test('measures add to the lifetime total once each', async ($, on) => {
  const clock = mock.clock(on)
  mock.store(on, { lifetime: 10 })
  on('session.id', () => ({ value: 's1' }))
  on('session.measure', (_, e) => ({ changed: e.changed }))
  const measure = (usd: number) =>
    $.session.measure({ context: { window: 200000 } as never, rateLimits: [], cost: { usd }, changed: ['cost'] } as never)
  await measure(2)
  await measure(3.5)
  await measure(3.5)
  await clock.settle() // the folds run behind the measures
  const ui = await $.ui.mount(BAND)
  expect((await ui.find({ type: 'Text', text: /lifetime/ }))?.text).toBe('lifetime $13.50')
  expect((await ui.find({ type: 'Text', text: /\$3\.50/ }))?.text).toBe('$3.50 = 0.32 burritos')
  await ui.unmount()
})
