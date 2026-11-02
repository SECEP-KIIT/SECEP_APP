import { http, HttpResponse } from 'msw'
import type {
  ApiErrorBody,
  AppNotification,
  EmailListItem,
  ErrorCode,
  Page,
  PreferencesResponse,
  Project,
  RefreshResponse,
  UiPrefs,
} from '../api/types'
import { emails, me, notifications, projects, toListItem } from './fixtures'
import { computeGlance } from './glance'

const API = '/api/v1'
const MOCK_TOKEN = 'mock-access-token'

let requestSeq = 0
const error = (status: number, code: ErrorCode, message: string, details: unknown = null): Response =>
  HttpResponse.json<ApiErrorBody>(
    { error: { code, message, details, request_id: `req_mock_${++requestSeq}` } },
    { status },
  )

// Like the real API, every non-auth route requires the Bearer token, so the dev app goes through the same
// 401 → refresh → retry path that it will against M6.
const unauthenticated = (request: Request) =>
  request.headers.get('Authorization') !== `Bearer ${MOCK_TOKEN}`
    ? error(401, 'unauthenticated', 'Missing or expired access token')
    : null

// Mock-internal read state (the phishing and VPN emails start read). Task 5 moves this into the stateful store.
const readIds = new Set([emails[3].id, emails[4].id])

/** Validates a PATCH /me/preferences body like M6 would with zod: known keys and types only, 422 otherwise. */
function validatePrefs(body: unknown): { prefs: UiPrefs } | { fields: Record<string, string> } {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return { fields: { _: 'Expected an object' } }
  const checks: Record<keyof UiPrefs, (v: unknown) => boolean> = {
    motion: (v) => v === 'full' || v === 'reduced' || v === 'off',
    skip_lock: (v) => typeof v === 'boolean',
    idle_minutes: (v) => v === null || (Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 240),
    glance_subjects: (v) => typeof v === 'boolean',
    sidebar_collapsed: (v) => typeof v === 'boolean',
  }
  const fields: Record<string, string> = {}
  for (const [key, value] of Object.entries(body)) {
    const check = checks[key as keyof UiPrefs]
    if (!check) fields[key] = 'Unknown preference'
    else if (!check(value)) fields[key] = 'Invalid value'
  }
  return Object.keys(fields).length ? { fields } : { prefs: body as UiPrefs }
}

export const handlers = [
  http.post(`${API}/auth/refresh`, () =>
    HttpResponse.json<RefreshResponse>({ access_token: MOCK_TOKEN, expires_in: 900 }),
  ),

  http.get(`${API}/me`, ({ request }) => unauthenticated(request) ?? HttpResponse.json(me)),

  // Newest first (FR-ORC-008); filters and cursors come with the inbox in task 6.
  http.get(
    `${API}/emails`,
    ({ request }) =>
      unauthenticated(request) ??
      HttpResponse.json<Page<EmailListItem>>({
        items: emails
          .map(toListItem)
          .sort((a, b) => Date.parse(b.received_at) - Date.parse(a.received_at)),
        next_cursor: null,
      }),
  ),

  http.get(`${API}/emails/:id`, ({ request, params }) => {
    const email = emails.find((e) => e.id === params.id)
    return (
      unauthenticated(request) ??
      (email ? HttpResponse.json(email) : error(404, 'not_found', 'Email not found'))
    )
  }),

  // PROPOSED shapes (pending SRS v1.3) from here on.
  http.get(
    `${API}/me/glance`,
    ({ request }) =>
      unauthenticated(request) ??
      HttpResponse.json(
        computeGlance(emails, readIds, me.ui_prefs as UiPrefs, me.permissions.includes('security.review'), new Date()),
      ),
  ),

  http.patch(`${API}/me/preferences`, async ({ request }) => {
    const denied = unauthenticated(request)
    if (denied) return denied
    const result = validatePrefs(await request.json().catch(() => null))
    if ('fields' in result) return error(422, 'validation_failed', 'Invalid preferences', { fields: result.fields })
    me.ui_prefs = { ...me.ui_prefs, ...result.prefs }
    return HttpResponse.json<PreferencesResponse>({ ui_prefs: me.ui_prefs as UiPrefs })
  }),

  http.get(
    `${API}/notifications`,
    ({ request }) =>
      unauthenticated(request) ??
      HttpResponse.json<Page<AppNotification>>({ items: notifications, next_cursor: null }),
  ),

  http.get(
    `${API}/projects`,
    ({ request }) =>
      unauthenticated(request) ?? HttpResponse.json<Page<Project>>({ items: projects, next_cursor: null }),
  ),
]
