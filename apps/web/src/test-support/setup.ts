import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { toast } from 'sonner';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { resetFakeApi } from './fake-api';
import { server } from './msw-server';
import { installMatchMedia, resetViewport } from './viewport';

installMatchMedia();
// jsdom does not implement scrolling; the router's <ScrollRestoration> calls it on navigation.
window.scrollTo = () => undefined;

// Any request without a handler is a bug in the test (or an unexpected call in the app).
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));

afterEach(() => {
  cleanup();
  // Sonner keeps toasts in a module-level store and replays the active ones to every new <Toaster>:
  // without this, a toast raised by one test would satisfy a findByText() in the next.
  toast.dismiss();
  server.resetHandlers();
  server.events.removeAllListeners();
  resetFakeApi();
  resetViewport();
});

afterAll(() => server.close());
