// Wire types for the public API: SRS §6.4.1 (shapes) and §6.6 (enums and nullability). snake_case on purpose:
// the client uses exactly what the API sends, so switching from MSW to the real API needs no mapping layer.
// Only the shapes used so far are here; add the rest from §6.4.1 as features need them, never invent fields.

export type EmailType = 'Task' | 'Info' | 'Credentials' | 'Meeting' | 'Approval'
export type Urgency = 'Low' | 'Medium' | 'High' | 'Critical'
export type Sentiment = 'Positive' | 'Neutral' | 'Negative' | 'Frustrated'
export type LabelSource = 'encoder' | 'llm' | 'user' | 'rule'
export type EmailStatus = 'ingested' | 'triaged' | 'enriched' | 'enrich_pending' | 'enrich_failed'
export type SecurityFlag = 'none' | 'suspicious' | 'malicious'
export type RecipientPosition = 'to' | 'cc' | 'bcc'
export type LinkVerdict = 'pending' | 'clean' | 'suspicious' | 'malicious'
export type RoleCategory = 'Executive' | 'Manager' | 'Engineer' | 'Analyst' | 'Consultant' | 'Client-facing' | 'Other'
export type MailboxStatus = 'active' | 'paused' | 'revoked' | 'error'

export type ActionType = 'create_jira_issue' | 'add_board_card' | 'add_calendar_event'
export type ActionOrigin = 'decoder' | 'user' | 'rule'
export type ActionStatus = 'proposed' | 'accepted' | 'executing' | 'done' | 'failed' | 'rejected'
export type BoardColumn = 'todo' | 'in_progress' | 'done'
export type JiraPriority = 'Highest' | 'High' | 'Medium' | 'Low'

export interface Person {
  address: string
  name: string | null
}

/** triage.v1 without `schema` and `email_id`. */
export interface TriageView {
  email_type: { label: EmailType; confidence: number; source: LabelSource }
  urgency: { label: Urgency; confidence: number }
  sentiment: { label: Sentiment; score: number; confidence: number }
  needs_review: boolean
  model_version: string
  processed_at: string
}

/** The only form in which a link reaches the client (FR-SEC-004). `pending` → check_id and go_url are null. */
export interface LinkView {
  check_id: string | null
  anchor_text: string | null
  host: string
  verdict: LinkVerdict
  go_url: string | null
}

/** enrich.v1 action shape, used for decoder actions. */
export interface DecoderActionPayload {
  title: string | null
  description: string | null
  priority: JiraPriority | null
  due_date: string | null
  start: string | null
  end: string | null
  attendees: string[] | null
}

/** User card payload, §6.4 (FR-CNT-002), for `origin = "user"`. */
export interface UserCardPayload {
  title: string
  description: string | null
  due_date: string | null
  due_time: string | null
  urgency: Urgency | null
  checklist: { text: string; done: boolean }[]
  source: 'in_person' | 'call' | 'chat' | null
  person: string | null
}

export interface Action {
  id: string
  email_id: string | null
  type: ActionType
  origin: ActionOrigin
  status: ActionStatus
  payload: DecoderActionPayload | UserCardPayload
  board_column: BoardColumn | null
  board_position: number | null
  external_ref: string | null
  external_status: string | null
  error: string | null
  created_at: string
  updated_at: string
}

export interface EmailListItem {
  id: string
  thread_id: string | null
  from: Person
  to: Person[]
  cc: Person[]
  recipient_position: RecipientPosition
  subject: string | null
  received_at: string
  status: EmailStatus
  security_flag: SecurityFlag
  duplicate_count: number
  attachment_count: number
  reply_count: number
  has_masked_secret: boolean
  triage: TriageView | null
  summary_one_line: string | null
  proposed_action_count: number
  jira_key: string | null
  pinned: boolean
  snoozed_until: string | null
  // Should features; element shapes are not in the SRS yet, so nothing can be put in them until it is.
  projects: never[]
  tags: never[]
}

export interface EmailDetail extends EmailListItem {
  /** Sanitized, masked plain text. Never auto-link URLs in it; only `links` are clickable. */
  body_text: string
  summary_short: string | null
  actions: Action[]
  links: LinkView[]
  attachments: { index: number; filename: string; mime: string; size: number }[]
  /** In the same order as the [MASKED:<type>] tokens in body_text. secret_type is free text in §6.6. */
  masked_secrets: { id: string; secret_type: string }[]
  auth_results: { spf: string; dkim: string; dmarc: string } | null
  /** null when thread_id is null (§6.6 emails.thread_id is nullable). */
  thread: {
    id: string
    message_count: number
    messages: { id: string; from: Person; subject: string | null; received_at: string }[]
  } | null
}

export interface Me {
  id: string
  email: string
  display_name: string | null
  role_category: RoleCategory
  is_admin: boolean
  permissions: string[]
  mailbox: { address: string; status: MailboxStatus; last_polled_at: string | null } | null
  ui_prefs: Record<string, unknown>
}

export interface Page<T> {
  items: T[]
  next_cursor: string | null
}

export interface RefreshResponse {
  access_token: string
  expires_in: number
}

export type ErrorCode =
  | 'bad_request'
  | 'unauthenticated'
  | 'reauth_required'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'validation_failed'
  | 'action_invalid'
  | 'rate_limited'
  | 'upstream_error'
  | 'unavailable'

export interface ApiErrorBody {
  error: { code: ErrorCode; message: string; details: unknown; request_id: string }
}
