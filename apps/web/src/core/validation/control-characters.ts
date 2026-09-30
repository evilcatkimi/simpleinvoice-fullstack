/**
 * Mirrors the API's `@NoControlCharacters` rule so the form reports the problem before a round
 * trip: C0 controls (U+0000–U+001F) and DEL are rejected; multi-line fields (address, description)
 * may contain what a <textarea> produces — tab, line feed and carriage return.
 */

const LINE_BREAK_CHARACTERS = new Set(['\t', '\n', '\r']);

function isControlCharacter(character: string): boolean {
  const code = character.charCodeAt(0);
  return code < 0x20 || code === 0x7f;
}

export function containsControlCharacter(value: string, allowLineBreaks = false): boolean {
  for (const character of value) {
    if (
      isControlCharacter(character) &&
      !(allowLineBreaks && LINE_BREAK_CHARACTERS.has(character))
    ) {
      return true;
    }
  }
  return false;
}

/** Turns every control character into a space (for free text read from a URL, e.g. a search). */
export function replaceControlCharacters(value: string): string {
  return Array.from(value, (character) => (isControlCharacter(character) ? ' ' : character)).join(
    '',
  );
}

/** zod refinement predicate: `.refine(withoutControlCharacters(), message)`. */
export function withoutControlCharacters({ multiline = false } = {}) {
  return (value: string): boolean => !containsControlCharacter(value, multiline);
}
