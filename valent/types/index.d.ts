/** Whether the full logo banner shows, or the one-line band. */
export type IsFull = boolean

/** This session's spend, the lifetime total and the plan's windows (-1: none). */
export type Burn = {
  usd: number
  lifetime: number
  session: number
  week: number
  sessionResets: string
  weekResets: string
}

declare module 'claude-code' {
  interface PluginState {
    valent: { isBannerFull: IsFull; burn: Burn }
  }
}
