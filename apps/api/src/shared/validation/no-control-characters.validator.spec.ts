import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { containsControlCharacter, NoControlCharacters } from './no-control-characters.validator';

class Note {
  @NoControlCharacters()
  title: unknown;

  @NoControlCharacters({ multiline: true })
  body: unknown;
}

function messages(plain: object): string[] {
  return validateSync(plainToInstance(Note, plain)).flatMap((error) =>
    Object.values(error.constraints ?? {}),
  );
}

describe('containsControlCharacter', () => {
  it.each(['\u0000', '\u0007', '\u001b[31m', '\u007f', 'a\tb', 'a\nb', 'a\rb'])(
    'finds a control character in %j',
    (value) => {
      expect(containsControlCharacter(value)).toBe(true);
    },
  );

  it.each(['Jane Doe', "Erin O'Brien", 'Mateo García', 'Blue Harbour Café', '₫ 1.000', ''])(
    'finds none in %j (printable Unicode is fine)',
    (value) => {
      expect(containsControlCharacter(value)).toBe(false);
    },
  );

  it('allows tab, line feed and carriage return only when asked to', () => {
    expect(containsControlCharacter('12 George St\r\nSydney\tNSW', true)).toBe(false);
    expect(containsControlCharacter('line\u0000break', true)).toBe(true);
    expect(containsControlCharacter('bell\u0007', true)).toBe(true);
  });
});

describe('NoControlCharacters', () => {
  it('rejects NUL, which PostgreSQL refuses in text columns', () => {
    expect(messages({ title: 'Eve\u0000Null', body: 'ok' })).toEqual([
      'title must not contain control characters',
    ]);
  });

  it('accepts line breaks in multi-line fields only', () => {
    expect(messages({ title: 'Two\nlines', body: 'Two\r\nlines' })).toEqual([
      'title must not contain control characters',
    ]);
  });

  it('leaves type errors to @IsString (non-strings pass)', () => {
    expect(messages({ title: 42, body: null })).toEqual([]);
  });
});
