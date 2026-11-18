import { describe, expect, it } from 'vitest'
import { maskSecrets } from './maskSecrets'

describe('maskSecrets (FR-CNT-005)', () => {
  it('masks passwords, codes, keys, tokens and card numbers, keeping labels', () => {
    const { masked_text, secrets } = maskSecrets(
      'VPN password: hunter2!\nOTP 482913\nkey sk_live_abcdefghijklmnop1234 and AKIAABCDEFGHIJKLMNOP\ncard 4111 1111 1111 1111\njwt eyJhbGciOiJIUzI1.eyJzdWIiOiIxMjM0.SflKxwRJSMeKKF2QT4',
    )
    expect(masked_text).toBe(
      'VPN password: [MASKED:password]\nOTP [MASKED:otp]\nkey [MASKED:api_key] and [MASKED:api_key]\ncard [MASKED:card_number]\njwt [MASKED:jwt]',
    )
    expect(secrets.map((s) => s.type).sort()).toEqual(['api_key', 'api_key', 'card_number', 'jwt', 'otp', 'password'])
  })

  it('leaves ordinary text, non-Luhn numbers and existing tokens alone', () => {
    const text = 'Order 1234 5678 9012 3456 shipped. password: [MASKED:password]. The pass is open.'
    expect(maskSecrets(text)).toEqual({ masked_text: text, secrets: [] })
  })
})
