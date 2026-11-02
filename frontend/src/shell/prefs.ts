import { useEffect } from 'react'
import { useMe } from '../api/queries'
import type { UiPrefs } from '../api/types'
import { lock } from '../boot/lock'

export type ResolvedPrefs = Required<Omit<UiPrefs, 'motion'>> & Pick<UiPrefs, 'motion'>

const DEFAULTS: ResolvedPrefs = {
  motion: undefined, // follow the OS
  skip_lock: false,
  idle_minutes: 15,
  glance_subjects: false,
  sidebar_collapsed: false,
}

/** ui_prefs is free-form jsonb on the server; take only well-typed values and default the rest. */
export function resolvePrefs(raw: Record<string, unknown> | undefined): ResolvedPrefs {
  const p = (raw ?? {}) as UiPrefs
  const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d)
  return {
    motion: p.motion === 'full' || p.motion === 'reduced' || p.motion === 'off' ? p.motion : DEFAULTS.motion,
    skip_lock: bool(p.skip_lock, DEFAULTS.skip_lock),
    idle_minutes: p.idle_minutes === null || typeof p.idle_minutes === 'number' ? p.idle_minutes : DEFAULTS.idle_minutes,
    glance_subjects: bool(p.glance_subjects, DEFAULTS.glance_subjects),
    sidebar_collapsed: bool(p.sidebar_collapsed, DEFAULTS.sidebar_collapsed),
  }
}

export function usePrefs(): ResolvedPrefs {
  const { data: me } = useMe()
  return resolvePrefs(me?.ui_prefs)
}

/** Hands the lock-relevant prefs to the lock controller, which also mirrors them for the next static paint. */
export function useApplyPrefs() {
  const { skip_lock, idle_minutes, motion } = usePrefs()
  const { isSuccess } = useMe()
  useEffect(() => {
    if (isSuccess) lock.configure({ skip_lock, idle_minutes, motion })
  }, [isSuccess, skip_lock, idle_minutes, motion])
}
