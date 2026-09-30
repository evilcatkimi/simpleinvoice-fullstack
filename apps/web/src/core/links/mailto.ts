/**
 * Builds a `mailto:` link that can only ever address a message to `address`.
 *
 * Customer emails are user input, and RFC 5322 allows `?`, `&`, `%` and `#` in the local part, so
 * the API accepts `billing?bcc=spy%40evil.example&subject=…&x=@example.com`. Interpolated as is,
 * that would pre-fill the reader's mail client with an attacker's Bcc, subject or body. Encoding the
 * whole address keeps every character inside the recipient; only `@`, which cannot start a header,
 * is turned back into a readable character.
 */
export function mailtoHref(address: string): string {
  return `mailto:${encodeURIComponent(address).replaceAll('%40', '@')}`;
}
