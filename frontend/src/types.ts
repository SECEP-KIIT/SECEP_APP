// Mirrors docs/diagrams/secep-class.mmd (camelCase). fromName comes from SRS 6.6 emails.from_name.
export type EmailType = 'Task' | 'Info' | 'Credentials' | 'Meeting' | 'Approval'
export type Urgency = 'Low' | 'Medium' | 'High' | 'Critical'
export type Sentiment = 'Positive' | 'Neutral' | 'Negative' | 'Frustrated'
export type EmailStatus = 'ingested' | 'triaged' | 'enriched' | 'enrich_pending' | 'enrich_failed'
export type SecurityFlag = 'none' | 'suspicious' | 'malicious'

export interface TriageResult {
  emailType: EmailType
  typeConf: number
  typeSource: 'encoder' | 'llm' | 'user'
  urgency: Urgency
  urgencyConf: number
  sentiment: Sentiment
  sentimentScore: number
  sentimentConf: number
  needsReview: boolean
  modelVersion: string
  processedAt: string
}

export interface Summary {
  oneLine: string
  short: string
  model: string
}

// The client only ever sees the type; the encrypted value stays server-side (FR-SEC-007).
export interface MaskedSecretRef {
  id: string
  secretType: string
}

export interface Email {
  id: string
  tenantId: string
  providerMessageId: string
  messageIdHdr: string
  fromAddr: string
  fromName: string | null
  toAddrs: string[]
  ccAddrs: string[]
  recipientPosition: 'to' | 'cc' | 'bcc'
  subject: string
  receivedAt: string
  bodyText: string
  mlText: string
  urls: { anchor: string; href: string }[]
  attachments: { filename: string; mime: string; size: number; sha256: string }[]
  authResults: { spf: string; dkim: string; dmarc: string } | null
  status: EmailStatus
  securityFlag: SecurityFlag
  duplicateCount: number
  triage: TriageResult | null
  summary: Summary | null
  maskedSecrets: MaskedSecretRef[]
}
