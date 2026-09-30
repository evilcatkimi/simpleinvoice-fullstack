import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { login, logout } from './session-api';
import { currentUserQueryOptions, endSession, sessionKeys } from './session-cache';

export function useCurrentUser() {
  const { data, status, error, isFetching, refetch } = useQuery(currentUserQueryOptions());
  return { user: data ?? null, status, error, isFetching, refetch };
}

export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: login,
    // The credentials are this mutation's `variables`: drop it as soon as nothing observes it
    // (the login screen unmounts on success and resets it after a failure), not 5 minutes later.
    gcTime: 0,
    onSuccess: (user) => {
      queryClient.setQueryData(sessionKeys.currentUser(), user);
    },
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: logout,
    onSuccess: () => {
      endSession(queryClient);
    },
  });
}
