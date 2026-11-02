// The five §7.2 demo emails as GET /emails/:id would return them (SRS §6.4.1). Secrets are already masked and URLs
// already reduced to LinkView, as the server does it (FR-SEC-004, FR-SEC-006). Typed as EmailDetail so an extra or
// missing field is a compile error; fixtures.test.ts checks the exact key sets at runtime too.
import type { AppNotification, EmailDetail, EmailListItem, Me, Person, Project, TriageView } from '../api/types'
import { buildNotification } from './notifications'

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

const ME: Person = { address: 'demo@northwind.example', name: 'Demo User' }

export const me: Me = {
  id: id(900),
  email: ME.address,
  display_name: ME.name,
  role_category: 'Engineer',
  is_admin: true,
  permissions: ['security.review'],
  mailbox: { address: ME.address, status: 'active', last_polled_at: '2026-11-04T09:20:00Z' },
  ui_prefs: {},
}

const triage = (
  type: TriageView['email_type']['label'],
  urgency: TriageView['urgency']['label'],
  sentiment: TriageView['sentiment']['label'],
  { typeConf = 0.88, score = 0, needsReview = false } = {},
): TriageView => ({
  email_type: { label: type, confidence: typeConf, source: 'encoder' },
  urgency: { label: urgency, confidence: 0.81 },
  sentiment: { label: sentiment, score, confidence: 0.86 },
  needs_review: needsReview,
  model_version: 'triage-stub-0.1',
  processed_at: '2026-11-04T09:15:00Z',
})

// Fields every demo email shares; each fixture overrides what it needs.
const base = {
  to: [ME],
  cc: [],
  recipient_position: 'to',
  status: 'enriched',
  security_flag: 'none',
  duplicate_count: 0,
  attachment_count: 0,
  reply_count: 0,
  has_masked_secret: false,
  proposed_action_count: 0,
  jira_key: null,
  pinned: false,
  snoozed_until: null,
  projects: [],
  tags: [],
  actions: [],
  links: [],
  attachments: [],
  masked_secrets: [],
  auth_results: { spf: 'pass', dkim: 'pass', dmarc: 'pass' },
} satisfies Partial<EmailDetail>

const rSen: Person = { address: 'r.sen@northwind.example', name: 'R. Sen' }

export const emails: EmailDetail[] = [
  {
    ...base,
    id: id(1),
    thread_id: id(101),
    from: rSen,
    subject: 'Q3 board deck: final numbers by Friday 5 pm',
    received_at: '2026-11-04T09:12:31Z',
    reply_count: 3,
    attachment_count: 1,
    triage: triage('Task', 'Critical', 'Neutral', { score: -0.05 }),
    summary_one_line: 'Add the final Q3 revenue and churn figures to slides 4–7 and send the deck by Friday 5 pm.',
    summary_short:
      'R. Sen needs the board deck finished before Friday’s meeting. Finance has signed off the Q3 revenue and ' +
      'churn numbers; they go on slides 4–7. Send the updated deck back by Friday 5 pm.',
    body_text:
      'Hi,\n\nFinance signed off the Q3 numbers this morning. Can you put the final revenue and churn figures ' +
      'into slides 4–7 of the attached board deck and send it back by Friday 5 pm?\n\nThanks,\nR. Sen',
    proposed_action_count: 1,
    actions: [
      {
        id: id(201),
        email_id: id(1),
        type: 'create_jira_issue',
        origin: 'decoder',
        status: 'proposed',
        payload: {
          title: 'Finalise Q3 board deck (slides 4–7)',
          description: 'Add the signed-off Q3 revenue and churn figures to slides 4–7 and send the deck to R. Sen.',
          priority: 'Highest',
          due_date: '2026-11-06',
          start: null,
          end: null,
          attendees: null,
        },
        board_column: null,
        board_position: null,
        external_ref: null,
        external_status: null,
        error: null,
        created_at: '2026-11-04T09:15:10Z',
        updated_at: '2026-11-04T09:15:10Z',
      },
    ],
    attachments: [{ index: 0, filename: 'board-deck-q3.pptx', mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', size: 482113 }],
    thread: {
      id: id(101),
      message_count: 4,
      messages: [
        { id: id(11), from: rSen, subject: 'Q3 board deck', received_at: '2026-11-03T15:02:00Z' },
        { id: id(12), from: ME, subject: 'Re: Q3 board deck', received_at: '2026-11-03T16:40:00Z' },
        { id: id(13), from: rSen, subject: 'Re: Q3 board deck', received_at: '2026-11-04T08:01:00Z' },
        { id: id(1), from: rSen, subject: 'Q3 board deck: final numbers by Friday 5 pm', received_at: '2026-11-04T09:12:31Z' },
      ],
    },
  },
  {
    ...base,
    id: id(2),
    thread_id: id(102),
    from: { address: 'priya.nair@northwind.example', name: 'Priya Nair' },
    cc: [rSen],
    subject: 'Design review for the onboarding flow, Thu 11:00',
    received_at: '2026-11-04T09:10:05Z',
    triage: triage('Meeting', 'Medium', 'Positive', { score: 0.42 }),
    summary_one_line: 'Design review of the onboarding flow on Thursday 6 Nov, 11:00–11:45.',
    summary_short:
      'Priya invites you to review the new onboarding screens on Thursday at 11:00 for 45 minutes. ' +
      'Bring notes on the sign-up step.',
    body_text:
      'Hi both,\n\nCould we review the new onboarding screens on Thursday at 11:00? 45 minutes should do. ' +
      'Please bring your notes on the sign-up step.\n\nPriya',
    proposed_action_count: 1,
    actions: [
      {
        id: id(202),
        email_id: id(2),
        type: 'add_calendar_event',
        origin: 'decoder',
        status: 'proposed',
        payload: {
          title: 'Onboarding flow design review',
          description: 'Review the new onboarding screens; bring notes on the sign-up step.',
          priority: null,
          due_date: null,
          start: '2026-11-06T05:30:00Z',
          end: '2026-11-06T06:15:00Z',
          attendees: ['priya.nair@northwind.example', 'r.sen@northwind.example', ME.address],
        },
        board_column: null,
        board_position: null,
        external_ref: null,
        external_status: null,
        error: null,
        created_at: '2026-11-04T09:15:20Z',
        updated_at: '2026-11-04T09:15:20Z',
      },
    ],
    thread: {
      id: id(102),
      message_count: 1,
      messages: [
        { id: id(2), from: { address: 'priya.nair@northwind.example', name: 'Priya Nair' }, subject: 'Design review for the onboarding flow, Thu 11:00', received_at: '2026-11-04T09:10:05Z' },
      ],
    },
  },
  {
    ...base,
    id: id(3),
    thread_id: id(103),
    from: rSen,
    subject: 'Please approve: travel request for the Pune client visit',
    received_at: '2026-11-04T09:08:44Z',
    duplicate_count: 2,
    // Low confidence, so the type chip shows the needs-review "?" (FR-UI-012).
    triage: triage('Approval', 'High', 'Positive', { typeConf: 0.54, score: 0.3, needsReview: true }),
    summary_one_line: 'Approve the travel request for the Pune client visit on 12–13 Nov before Wednesday.',
    summary_short:
      'R. Sen asks you to approve the travel request for the Pune client visit on 12–13 November. ' +
      'Bookings close on Wednesday.',
    body_text:
      'Hi,\n\nI’ve raised the travel request for the Pune client visit (12–13 Nov). Could you approve it in the ' +
      'portal before Wednesday so we can book?\n\nThanks,\nR. Sen',
    proposed_action_count: 1,
    actions: [
      {
        id: id(203),
        email_id: id(3),
        type: 'add_board_card',
        origin: 'decoder',
        status: 'proposed',
        payload: {
          title: 'Approve Pune travel request',
          description: 'Approve the 12–13 Nov travel request in the portal before Wednesday.',
          priority: null,
          due_date: '2026-11-05',
          start: null,
          end: null,
          attendees: null,
        },
        board_column: null,
        board_position: null,
        external_ref: null,
        external_status: null,
        error: null,
        created_at: '2026-11-04T09:15:30Z',
        updated_at: '2026-11-04T09:15:30Z',
      },
    ],
    thread: {
      id: id(103),
      message_count: 1,
      messages: [
        { id: id(3), from: rSen, subject: 'Please approve: travel request for the Pune client visit', received_at: '2026-11-04T09:08:44Z' },
      ],
    },
  },
  {
    ...base,
    id: id(4),
    thread_id: id(104),
    from: { address: 'it-helpdesk@northwind.example', name: 'IT Helpdesk' },
    subject: 'Your VPN account is ready',
    received_at: '2026-11-04T09:05:12Z',
    has_masked_secret: true,
    // Enrichment still running: summary is null and status says why (§6.4.1).
    status: 'enrich_pending',
    triage: triage('Credentials', 'Medium', 'Neutral'),
    summary_one_line: null,
    summary_short: null,
    body_text:
      'Hello,\n\nYour VPN account has been created.\n\nUsername: demo\nPassword: [MASKED:password]\n\n' +
      'Please change the password after your first sign-in.\n\nIT Helpdesk',
    masked_secrets: [{ id: id(301), secret_type: 'password' }],
    thread: {
      id: id(104),
      message_count: 1,
      messages: [
        { id: id(4), from: { address: 'it-helpdesk@northwind.example', name: 'IT Helpdesk' }, subject: 'Your VPN account is ready', received_at: '2026-11-04T09:05:12Z' },
      ],
    },
  },
  {
    ...base,
    id: id(5),
    thread_id: id(105),
    // Lookalike of the protected domain northwind.example ("l" for "i").
    from: { address: 'security@northwlnd.example', name: 'Northwind Security' },
    subject: 'Unusual sign-in detected: verify your account',
    received_at: '2026-11-04T09:02:58Z',
    security_flag: 'suspicious',
    triage: triage('Info', 'High', 'Negative', { score: -0.55 }),
    summary_one_line: 'Claims an unusual sign-in and asks you to verify your account within 24 hours.',
    summary_short:
      'The sender says an unusual sign-in was detected and asks you to verify your account through a link ' +
      'within 24 hours or lose access.',
    body_text:
      'Dear user,\n\nWe detected an unusual sign-in to your account. To keep access, verify your account within ' +
      '24 hours using the button below.\n\nNorthwind Security Team',
    links: [
      {
        check_id: id(401),
        anchor_text: 'Verify your account',
        host: 'northwlnd-login.example',
        verdict: 'suspicious',
        go_url: `/api/v1/links/${id(401)}/go`,
      },
    ],
    auth_results: { spf: 'pass', dkim: 'none', dmarc: 'fail' },
    thread: {
      id: id(105),
      message_count: 1,
      messages: [
        { id: id(5), from: { address: 'security@northwlnd.example', name: 'Northwind Security' }, subject: 'Unusual sign-in detected: verify your account', received_at: '2026-11-04T09:02:58Z' },
      ],
    },
  },
]

/** EmailDetail → EmailListItem: drop the detail-only fields, as GET /emails does. */
export function toListItem(email: EmailDetail): EmailListItem {
  const {
    body_text: _body,
    summary_short: _short,
    actions: _actions,
    links: _links,
    attachments: _attachments,
    masked_secrets: _secrets,
    auth_results: _auth,
    thread: _thread,
    ...item
  } = email
  return item
}

// PROPOSED shapes (pending SRS v1.3), see api/types.ts.

export const projects: Project[] = [
  { id: id(501), name: 'Q3 board meeting', colour: '#3b5bdb', icon: '📊', description: 'Deck and numbers for the Q3 board meeting.', deadline: '2026-11-07T11:30:00Z', jira_project_key: 'ATL', jira_epic: 'ATL-100', archived_at: null, created_at: '2026-10-20T08:00:00Z', progress: { done: 2, total: 5 } },
  { id: id(502), name: 'Pune client visit', colour: '#e8590c', icon: '✈️', description: null, deadline: '2026-11-12T03:30:00Z', jira_project_key: null, jira_epic: null, archived_at: null, created_at: '2026-10-28T08:00:00Z', progress: { done: 1, total: 3 } },
  { id: id(503), name: 'Onboarding redesign', colour: '#2b8a3e', icon: '🧭', description: 'New sign-up and first-run screens.', deadline: null, jira_project_key: 'ONB', jira_epic: null, archived_at: null, created_at: '2026-10-01T08:00:00Z', progress: { done: 4, total: 4 } },
]

export const notifications: AppNotification[] = [
  buildNotification(3, { kind: 'new_email', email: toListItem(emails[0]) }, { type: 'email', id: emails[0].id }, '2026-11-04T09:12:40Z'),
  buildNotification(2, { kind: 'meeting', title: 'Onboarding flow design review', minutes: 15 }, null, '2026-11-04T09:00:00Z'),
  buildNotification(1, { kind: 'jira_status', key: 'ATL-141', status: 'Done', title: 'Collect Q3 churn figures' }, null, '2026-11-04T08:30:00Z'),
]
