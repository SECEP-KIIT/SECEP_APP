// Runtime knobs for the mock, changed from the dev panel. Dev-only, like everything under src/mocks.
export type JiraMode = 'ok' | 'rate_limited_once' | 'server_error' | 'unauthorized' | 'bad_request'

export const control = {
  /** Simulated network latency in ms (min, max). Tests set 0. */
  latency: [80, 250] as [number, number],
  jiraMode: 'ok' as JiraMode,
  /** Incoming mail: seconds between arrivals, and a speed multiplier for every simulated delay. */
  arrivalEvery: [60, 120] as [number, number],
  speed: 1,
  paused: false,
}

export const scaled = (ms: number) => ms / control.speed

/** The dev panel changes knobs only through this, not by mutating `control` from components. */
export function setControl(patch: Partial<typeof control>) {
  Object.assign(control, patch)
}
