import { type QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { Toaster } from 'sonner';

interface AppProvidersProps {
  queryClient: QueryClient;
  children: ReactNode;
}

/** App-wide providers, shared by the real entry point and the test render helper. */
export function AppProviders({ queryClient, children }: AppProvidersProps) {
  return (
    <QueryClientProvider client={queryClient}>
      {children}
      {/* Offset below the sticky header so a toast never covers "Sign out". */}
      <Toaster
        position="top-right"
        offset={{ top: '4.75rem' }}
        mobileOffset={{ top: '4.5rem' }}
        richColors
        closeButton
      />
    </QueryClientProvider>
  );
}
