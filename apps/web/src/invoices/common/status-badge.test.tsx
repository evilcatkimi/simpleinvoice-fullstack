import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { INVOICE_STATUSES } from '../model/invoice';
import { StatusBadge } from './status-badge';

describe('StatusBadge', () => {
  it.each(INVOICE_STATUSES)('spells out "%s", so colour is never the only signal', (status) => {
    render(<StatusBadge status={status} />);

    expect(screen.getByText(status)).toBeVisible();
  });

  it('gives every status a look of its own', () => {
    render(
      <>
        {INVOICE_STATUSES.map((status) => (
          <StatusBadge key={status} status={status} />
        ))}
      </>,
    );

    const looks = INVOICE_STATUSES.map((status) => screen.getByText(status).className);
    expect(new Set(looks).size).toBe(INVOICE_STATUSES.length);
  });
});
