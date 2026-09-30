import { buildMessage, ValidateBy, type ValidationOptions } from 'class-validator';

/** What a <textarea> legitimately produces: tab, line feed and carriage return. */
const LINE_BREAK_CHARACTERS = new Set(['\t', '\n', '\r']);

/**
 * C0 controls (U+0000–U+001F) and DEL. PostgreSQL refuses NUL in text columns (a 500 before this check existed); the
 * others have no place in names or references and can forge log lines or terminal output.
 */
export function containsControlCharacter(value: string, allowLineBreaks = false): boolean {
  for (const character of value) {
    const code = character.charCodeAt(0);
    if (
      (code < 0x20 || code === 0x7f) &&
      !(allowLineBreaks && LINE_BREAK_CHARACTERS.has(character))
    ) {
      return true;
    }
  }
  return false;
}

export interface NoControlCharactersOptions extends ValidationOptions {
  /** Allow tab, line feed and carriage return (multi-line fields such as a description or an address). */
  multiline?: boolean;
}

/** Non-strings pass: the type is checked by @IsString, so each problem is reported once. */
export function NoControlCharacters(options: NoControlCharactersOptions = {}): PropertyDecorator {
  const { multiline = false, ...validationOptions } = options;
  return ValidateBy(
    {
      name: 'noControlCharacters',
      validator: {
        validate: (value) =>
          typeof value !== 'string' || !containsControlCharacter(value, multiline),
        defaultMessage: buildMessage(
          (each) => `${each}$property must not contain control characters`,
          validationOptions,
        ),
      },
    },
    validationOptions,
  );
}
