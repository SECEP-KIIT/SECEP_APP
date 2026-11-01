import { http, HttpResponse } from 'msw'
import type { ApiErrorBody, ErrorCode, Page, EmailListItem, RefreshResponse } from '../api/types'
import { emails, me, toListItem } from './fixtures'

const API = '/api/v1'
const MOCK_TOKEN = 'mock-access-token'

let requestSeq = 0
const error = (status: number, code: ErrorCode, message: string): Response =>
  HttpResponse.json<ApiErrorBody>(
    { error: { code, message, details: null, request_id: `req_mock_${++requestSeq}` } },
    { status },
  )

// Like the real API, every non-auth route requires the Bearer token, so the dev app goes through the same
// 401 → refresh → retry path that it will against M6.
const unauthenticated = (request: Request) =>
  request.headers.get('Authorization') !== `Bearer ${MOCK_TOKEN}`
    ? error(401, 'unauthenticated', 'Missing or expired access token')
    : null

export const handlers = [
  http.post(`${API}/auth/refresh`, () =>
    HttpResponse.json<RefreshResponse>({ access_token: MOCK_TOKEN, expires_in: 900 }),
  ),

  http.get(`${API}/me`, ({ request }) => unauthenticated(request) ?? HttpResponse.json(me)),

  // Newest first (FR-ORC-008); filters and cursors come with the inbox in task 8.
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
]
