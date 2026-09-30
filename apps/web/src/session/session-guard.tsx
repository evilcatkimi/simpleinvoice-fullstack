import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router';
import { toast } from 'sonner';
import { setUnauthorizedHandler } from '@/core/api/api-client';
import { PageSpinner } from '@/ui/feedback';
import { QueryErrorState } from '@/ui/query-error-state';
import type { LoginLocationState } from './safe-redirect';
import { endSession } from './session-cache';
import { useCurrentUser } from './session-hooks';

/**
 * Layout route guarding every screen behind the login. It also owns the "session expired" reaction:
 * a 401 from any protected call ends the session, which re-renders this guard into a redirect to
 * the login screen — and the login screen brings the user back here afterwards.
 */
export function SessionGuard() {
  const queryClient = useQueryClient();
  const location = useLocation();
  const session = useCurrentUser();
  const { user, status } = session;

  useEffect(
    () =>
      setUnauthorizedHandler(() => {
        toast.error('Your session has expired. Please sign in again.', { id: 'session-expired' });
        endSession(queryClient);
      }),
    [queryClient],
  );

  if (status === 'pending') return <PageSpinner label="Checking your session…" />;
  if (user) return <Outlet />;
  if (status === 'error') {
    return <QueryErrorState title="We couldn't verify your session" query={session} />;
  }

  const state: LoginLocationState = {
    from: `${location.pathname}${location.search}${location.hash}`,
  };
  return <Navigate to="/login" replace state={state} />;
}
