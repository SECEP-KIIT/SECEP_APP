// The note masker (FR-CNT-005, proposals §19.2): what M6 runs on a note before it's stored, until M5's
// POST /v1/mask is available. A copy lives in backend/src/services/mask.js; keep the two the same. Each secret is
// replaced by [MASKED:<type>]; the value is never kept (§18.4). Existing tokens are left alone.

const RULES: { type: string; re: RegExp; keepLabel?: boolean }[] = [
  { type: 'pem_private_key', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g },
  { type: 'jwt', re: /\beyJ[\w-]{8,}\.[\w-]{8,}\.[\w-]{8,}/g },
  { type: 'api_key', re: /\b(?:sk|pk|rk)_(?:live|test)_[A-Za-z0-9]{16,}\b|\bAKIA[0-9A-Z]{16}\b|\bgh[pousr]_[A-Za-z0-9]{30,}\b|\bxox[abpr]-[A-Za-z0-9-]{10,}\b|\bAIza[0-9A-Za-z_-]{35}\b/g },
  // "password: hunter2", "pwd = x": the label stays, the value goes.
  { type: 'password', re: /\b(password|passwd|passcode|pwd|pass(?=\s*[:=]))(\s*[:=]\s*|\s+is\s+)(?!\[MASKED:)(\S+)/gi, keepLabel: true },
  { type: 'otp', re: /\b(otp|one[- ]time (?:code|password)|verification code|pin)(\s*[:=]?\s*|\s+is\s+)(\d{4,8})\b/gi, keepLabel: true },
  { type: 'card_number', re: /\b(?:\d[ -]?){12,18}\d\b/g },
]

function luhn(digits: string) {
  let sum = 0
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i])
    if (i % 2 === 1) {
      d *= 2
      if (d > 9) d -= 9
    }
    sum += d
  }
  return sum % 10 === 0
}

export function maskSecrets(text: string): { masked_text: string; secrets: { type: string }[] } {
  const secrets: { type: string }[] = []
  let out = text
  for (const { type, re, keepLabel } of RULES) {
    out = out.replace(re, (match: string, ...groups: unknown[]) => {
      if (type === 'card_number') {
        const digits = match.replace(/\D/g, '')
        if (digits.length < 13 || !luhn(digits)) return match
      }
      secrets.push({ type })
      return keepLabel ? `${groups[0] as string}${groups[1] as string}[MASKED:${type}]` : `[MASKED:${type}]`
    })
  }
  return { masked_text: out, secrets }
}
