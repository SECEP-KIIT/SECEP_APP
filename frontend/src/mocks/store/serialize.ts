// The ONLY place wire shapes are built (SRS §6.4.1). Rows → responses. Fields not listed in §6.4.1 never leave
// here: raw URLs, secret values, user_id, ml_text and other internals. The contract tests pin the key sets.
import type { Action, EmailDetail, EmailListItem, LinkView, Me, Project } from '../../api/types'
import type { ActionRow, Db, EmailRow, ModelRow, ProjectRow, SettingsRow, UrlCheckRow, UserRow } from './types'

export function toAction(a: ActionRow): Action {
  const { user_id: _owner, ...action } = a
  return { ...action, payload: { ...action.payload } }
}

export function toLink(c: UrlCheckRow): LinkView {
  const scored = c.verdict !== 'pending'
  return {
    check_id: scored ? c.id : null,
    anchor_text: c.anchor_text,
    host: c.host,
    verdict: c.verdict,
    go_url: scored ? `/api/v1/links/${c.id}/go` : null,
  }
}

export function toListItem(db: Db, e: EmailRow): EmailListItem {
  const thread = e.thread_id ? db.threads.get(e.thread_id) : undefined
  const actions = [...db.actions.values()].filter((a) => a.email_id === e.id)
  const jira = actions.find((a) => a.type === 'create_jira_issue' && a.external_ref)
  return {
    id: e.id,
    thread_id: e.thread_id,
    from: { ...e.from },
    to: e.to.map((p) => ({ ...p })),
    cc: e.cc.map((p) => ({ ...p })),
    recipient_position: e.recipient_position,
    subject: e.subject,
    received_at: e.received_at,
    status: e.status,
    security_flag: e.security_flag,
    duplicate_count: e.duplicate_count,
    attachment_count: e.attachments.length,
    reply_count: thread ? thread.messages.length - 1 : 0,
    has_masked_secret: db.secrets.some((s) => s.email_id === e.id),
    triage: e.triage && structuredClone(e.triage),
    summary_one_line: e.summary?.one_line ?? null,
    proposed_action_count: actions.filter((a) => a.status === 'proposed').length,
    jira_key: jira?.external_ref ?? null,
    pinned: e.pinned,
    snoozed_until: e.snoozed_until,
    projects: [],
    tags: [],
  }
}

export function toDetail(db: Db, e: EmailRow): EmailDetail {
  const thread = e.thread_id ? db.threads.get(e.thread_id) : undefined
  return {
    ...toListItem(db, e),
    body_text: e.body_text,
    summary_short: e.summary?.short ?? null,
    actions: [...db.actions.values()].filter((a) => a.email_id === e.id).map(toAction),
    links: db.urlChecks.filter((c) => c.email_id === e.id).map(toLink),
    attachments: e.attachments.map((a) => ({ ...a })),
    // Same order as the [MASKED:<type>] tokens in body_text.
    masked_secrets: db.secrets.filter((s) => s.email_id === e.id).map((s) => ({ id: s.id, secret_type: s.secret_type })),
    auth_results: e.auth_results && { ...e.auth_results },
    thread: thread
      ? { id: thread.id, message_count: thread.messages.length, messages: thread.messages.map((m) => ({ ...m, from: { ...m.from } })) }
      : null,
  }
}

export function toMe(u: UserRow): Me {
  return {
    id: u.id,
    email: u.email,
    display_name: u.display_name,
    role_category: u.role_category,
    is_admin: u.is_admin,
    permissions: [...u.permissions],
    mailbox: u.mailbox && { ...u.mailbox },
    ui_prefs: { ...u.ui_prefs },
  }
}

/** Admin `User` (§6.4.1). */
export function toUser(u: UserRow) {
  return {
    id: u.id,
    email: u.email,
    display_name: u.display_name,
    role_category: u.role_category,
    is_admin: u.is_admin,
    permissions: [...u.permissions],
    last_login_at: u.last_login_at,
  }
}

/** GET /admin/settings: secret values are never returned, only whether they are set (§6.4.1). */
export function toSettings(s: SettingsRow) {
  return {
    jira: { site_url: s.jira.site_url, email: s.jira.email, project_key: s.jira.project_key, token_set: s.jira.token !== null },
    llm: { base_url: s.llm.base_url, model: s.llm.model, api_style: s.llm.api_style, api_key_set: s.llm.api_key !== null },
    confidence_threshold: s.confidence_threshold,
    protected_domains: [...s.protected_domains],
    poll_interval_s: s.poll_interval_s,
  }
}

export function toModel(m: ModelRow) {
  return { id: m.id, version: m.version, status: m.status, metrics: structuredClone(m.metrics), created_at: m.created_at, promoted_at: m.promoted_at }
}

export function toProject(p: ProjectRow): Project {
  const { user_id: _owner, ...project } = p
  return { ...project, progress: { ...project.progress } }
}
