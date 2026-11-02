// Optional persistence of the mock store (VITE_MOCK_PERSIST=1). Only state a user created or changed is saved:
// users and their ui_prefs, read state, actions, label corrections and rules, projects, models, the audit log,
// settings, and which emails arrived. Everything regenerable (the seeded mailbox) is reseeded on load.
//
// Never persisted: secret values. That covers the fake masked credentials and the Jira/LLM tokens in settings
// (CLAUDE.md: nothing secret in localStorage).
//
// The blob carries a schema version. On any mismatch or parse problem it is discarded and the store reseeds, so a
// stale, incompatible store is never loaded.
import type { Db, SettingsRow } from './types'

export const STORAGE_KEY = 'secep.mock'
export const SCHEMA_VERSION = 1

type PersistedSettings = Omit<SettingsRow, 'jira' | 'llm'> & {
  jira: Omit<SettingsRow['jira'], 'token'> & { token_set: boolean }
  llm: Omit<SettingsRow['llm'], 'api_key'> & { api_key_set: boolean }
}

export interface Snapshot {
  schema: number
  seed: number
  data: {
    users: Db['users']
    reads: Record<string, string[]>
    actions: ReturnType<Db['actions']['get']>[]
    corrections: Db['corrections']
    labelRules: Db['labelRules']
    projects: Db['projects']
    models: Db['models']
    audit: Db['audit']
    settings: PersistedSettings
    arrivals: Db['arrivals']
  }
}

export function snapshot(db: Db, seed: number): Snapshot {
  const { jira, llm, ...rest } = db.settings
  const { token, ...jiraRest } = jira
  const { api_key, ...llmRest } = llm
  return {
    schema: SCHEMA_VERSION,
    seed,
    data: {
      users: db.users,
      reads: Object.fromEntries([...db.reads].map(([u, ids]) => [u, [...ids]])),
      actions: [...db.actions.values()],
      corrections: db.corrections,
      labelRules: db.labelRules,
      projects: db.projects,
      models: db.models,
      audit: db.audit,
      settings: { ...rest, jira: { ...jiraRest, token_set: token !== null }, llm: { ...llmRest, api_key_set: api_key !== null } },
      arrivals: db.arrivals,
    },
  }
}

/** Returns the snapshot if it is usable for this schema and seed; otherwise discards it and returns null. */
export function load(storage: Pick<Storage, 'getItem' | 'removeItem'>, seed: number): Snapshot | null {
  let raw: string | null
  try {
    raw = storage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
  if (!raw) return null
  try {
    const snap = JSON.parse(raw) as Snapshot
    const d = snap?.data
    const ok =
      snap?.schema === SCHEMA_VERSION &&
      snap.seed === seed &&
      Array.isArray(d?.users) && Array.isArray(d.actions) && Array.isArray(d.arrivals) &&
      typeof d.reads === 'object' && d.settings?.jira !== undefined
    if (ok) return snap
  } catch {
    // fall through to discard
  }
  console.info('[mock] discarding an incompatible persisted store and reseeding')
  storage.removeItem(STORAGE_KEY)
  return null
}

/** Applies a loaded snapshot on top of a freshly seeded store (arrivals must already be replayed). */
export function apply(db: Db, snap: Snapshot) {
  const d = snap.data
  db.users = d.users
  db.reads = new Map(Object.entries(d.reads).map(([u, ids]) => [u, new Set(ids)]))
  for (const a of d.actions) if (a && (a.email_id === null || db.emails.has(a.email_id))) db.actions.set(a.id, a)
  db.corrections = d.corrections.filter((c) => db.emails.has(c.email_id))
  for (const c of db.corrections) {
    const triage = db.emails.get(c.email_id)?.triage
    if (!triage) continue
    triage[c.field].label = c.new_label as never
    if (c.field === 'email_type') triage.email_type.source = 'user'
    triage.needs_review = false
  }
  db.labelRules = d.labelRules
  db.projects = d.projects
  db.models = d.models
  db.audit = d.audit
  // Secrets keep their seeded values; only the "is it set" state is restored.
  const { jira, llm, ...rest } = d.settings
  const { token_set, ...jiraRest } = jira
  const { api_key_set, ...llmRest } = llm
  db.settings = {
    ...rest,
    jira: { ...jiraRest, token: token_set ? db.settings.jira.token ?? 'mock-jira-token' : null },
    llm: { ...llmRest, api_key: api_key_set ? db.settings.llm.api_key ?? 'mock-llm-key' : null },
  }
}

export function save(storage: Pick<Storage, 'setItem'>, db: Db, seed: number) {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(snapshot(db, seed)))
  } catch (err) {
    console.warn('[mock] could not persist the store', err)
  }
}
