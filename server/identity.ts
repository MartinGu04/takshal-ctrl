/**
 * Cross-system recipient identity: a verified Google email address, normalized one way everywhere.
 *
 * TAKSHAL CTRL and its source systems authenticate the same people through Google, so a verified
 * email is the one identity both sides can name. It is only ever taken from a verified session
 * (Supabase Auth) or from a source system's own server-side identity — never from a browser.
 */

export const MAX_EMAIL_LENGTH = 254

// Deliberately simple: one "@", no whitespace/control characters, a dot in the domain. The address
// is compared, never used to send mail, so full RFC 5322 parsing would add nothing but risk.
// eslint-disable-next-line no-control-regex
const EMAIL_SHAPE = /^[^\s@\u0000-\u001f\u007f]+@[^\s@\u0000-\u001f\u007f]+\.[^\s@\u0000-\u001f\u007f]+$/

/** Trimmed + lowercased: the single normalization rule for every stored or compared address. */
export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase()
}

/** Returns the normalized address, or null if the value is not a plausible email. */
export function parseEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const email = normalizeEmail(value)
  if (email.length < 3 || email.length > MAX_EMAIL_LENGTH || !EMAIL_SHAPE.test(email)) return null
  return email
}
