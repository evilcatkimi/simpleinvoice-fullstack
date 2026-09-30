import { Transform } from 'class-transformer';

/** Trims surrounding whitespace; non-strings pass through untouched so validators can reject them. */
export const Trim = () =>
  Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value));

/** Trims optional text and stores blanks as null: an empty field means "not provided". */
export const TrimToNull = () =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() || null : value,
  );

/** Trims optional query parameters and drops blanks, so `?keyword=` behaves like no keyword at all. */
export const TrimToUndefined = () =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() || undefined : value,
  );

/** Trims and upper-cases (codes and enum-like input such as "asc"). */
export const ToUpperCase = () =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  );

/** Trims and lower-cases (e-mail addresses used as identifiers). */
export const ToLowerCase = () =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  );
