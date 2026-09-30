import { useEffect } from 'react';

const APP_NAME = 'SimpleInvoice';

export function useDocumentTitle(title: string): void {
  useEffect(() => {
    document.title = `${title} · ${APP_NAME}`;
  }, [title]);
}
