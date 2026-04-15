/** Rules for new/changed passwords (admin users). */
export function validatePasswordStrength(password: string): { ok: true } | { ok: false; message: string } {
  if (password.length < 12) {
    return { ok: false, message: 'Password must be at least 12 characters.' };
  }
  if (password.length > 256) {
    return { ok: false, message: 'Password is too long.' };
  }
  if (!/[a-z]/.test(password)) {
    return { ok: false, message: 'Password must include a lowercase letter.' };
  }
  if (!/[A-Z]/.test(password)) {
    return { ok: false, message: 'Password must include an uppercase letter.' };
  }
  if (!/[0-9]/.test(password)) {
    return { ok: false, message: 'Password must include a number.' };
  }
  if (!/[!@#$%^&*()_+\-=[\]{}|;:,.<>?]/.test(password)) {
    return { ok: false, message: 'Password must include a symbol (e.g. ! @ # $).' };
  }
  return { ok: true };
}
