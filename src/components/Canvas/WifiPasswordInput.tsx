import type { CSSProperties } from 'react'

/**
 * A masked field for a Wi-Fi password that browsers do not treat as a login.
 *
 * A `type="password"` input makes Chrome's password manager offer to save it
 * whenever the field leaves the page — switching away from the Graph tab counts
 * as a form submission — and `autoComplete="off"` does not stop it. Chrome then
 * guesses the nearest earlier text field as the username, so the prompt shows a
 * stray node property such as `0.5`. These credentials belong to the board's
 * network, not to this site, and already live in this browser's own storage.
 *
 * Where the engine can mask a plain text field, use one: password managers only
 * look at `type="password"`. Elsewhere fall back to a password field so the
 * secret is never shown in the clear; the `data-*` opt-outs cover the common
 * extension managers either way.
 */
const CAN_MASK_TEXT = typeof CSS !== 'undefined' && CSS.supports('-webkit-text-security', 'disc')
// Not in React's CSSProperties: the property is non-standard.
const MASKED = { WebkitTextSecurity: 'disc' } as CSSProperties

export interface WifiPasswordInputProps {
  id?: string
  value: string
  className?: string
  onChange: (value: string) => void
}

export default function WifiPasswordInput({ id, value, className, onChange }: WifiPasswordInputProps) {
  return (
    <input
      id={id}
      className={className}
      type={CAN_MASK_TEXT ? 'text' : 'password'}
      style={CAN_MASK_TEXT ? MASKED : undefined}
      autoComplete="off"
      autoCapitalize="off"
      autoCorrect="off"
      spellCheck={false}
      data-1p-ignore=""
      data-lpignore="true"
      data-bwignore=""
      data-form-type="other"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder="password"
    />
  )
}
