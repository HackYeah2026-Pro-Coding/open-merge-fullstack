import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Bounty, BountyListQuery, CreateBountyInput, User } from '@escrow/shared';
import { api } from './index';

export const queryKeys = {
  session: ['session'] as const,
  project: ['project'] as const,
  stats: ['stats'] as const,
  activity: ['activity'] as const,
  bounties: (query: BountyListQuery) => ['bounties', query] as const,
  bounty: (issueNumber: number) => ['bounty', issueNumber] as const,
  mySubmissions: ['me', 'submissions'] as const,
};

export function useSession() {
  return useQuery({ queryKey: queryKeys.session, queryFn: () => api.getSession(), staleTime: 60_000 });
}

export function useProject() {
  return useQuery({ queryKey: queryKeys.project, queryFn: () => api.getProject(), staleTime: Infinity });
}

export function useStats() {
  return useQuery({ queryKey: queryKeys.stats, queryFn: () => api.getStats() });
}

export function useActivity() {
  return useQuery({ queryKey: queryKeys.activity, queryFn: () => api.listActivity() });
}

export function useBounties(query: BountyListQuery) {
  return useQuery({
    queryKey: queryKeys.bounties(query),
    queryFn: () => api.listBounties(query),
    placeholderData: keepPreviousData,
  });
}

function hasPendingCheck(bounty: Bounty | undefined): boolean {
  return !!bounty?.submissions.some((s) => s.state === 'open' && s.check.state === 'pending');
}

export function useBounty(issueNumber: number, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: queryKeys.bounty(issueNumber),
    queryFn: () => api.getBounty(issueNumber),
    enabled: options.enabled,
    // Check results arrive asynchronously; poll only while one is outstanding.
    refetchInterval: (query) => (hasPendingCheck(query.state.data) ? 3_000 : false),
  });
}

export function useMySubmissions(enabled: boolean) {
  return useQuery({ queryKey: queryKeys.mySubmissions, queryFn: () => api.listMySubmissions(), enabled });
}

export function useCreateBounty() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateBountyInput) => api.createBounty(input),
    onSuccess: (bounty) => {
      client.setQueryData(queryKeys.bounty(bounty.issue.number), bounty);
      void client.invalidateQueries({ queryKey: ['bounties'] });
      void client.invalidateQueries({ queryKey: queryKeys.stats });
      void client.invalidateQueries({ queryKey: queryKeys.activity });
    },
  });
}

/**
 * Who is signed in changed: drop per-user data and wait for the new session, so
 * callers can navigate as soon as the mutation settles.
 */
function useSwitchIdentity<TVariables>(mutationFn: (variables: TVariables) => Promise<void>) {
  const client = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: async () => {
      client.removeQueries({ queryKey: ['me'] });
      await client.invalidateQueries({ queryKey: queryKeys.session });
    },
  });
}

export function useSignIn() {
  return useSwitchIdentity((next: string) => api.signIn(next));
}

export function useOpenOwnerView() {
  return useSwitchIdentity(() => api.openOwnerView());
}

/**
 * Leaves the owner view if it is open, otherwise signs the developer out.
 * `leave` runs before the session is refetched, so the page can move off a
 * route that would otherwise redirect to sign-in first.
 */
export function useSignOut() {
  return useSwitchIdentity(async (leave: () => void) => {
    await api.signOut();
    leave();
  });
}

/** Stores the updated user after a wallet change and refreshes what depends on it. */
export function useApplyUser() {
  const client = useQueryClient();
  return (user: User) => {
    client.setQueryData(queryKeys.session, { user });
    void client.invalidateQueries({ queryKey: ['me'] });
    void client.invalidateQueries({ queryKey: ['bounties'] });
    void client.invalidateQueries({ queryKey: ['bounty'] });
    void client.invalidateQueries({ queryKey: queryKeys.stats });
    void client.invalidateQueries({ queryKey: queryKeys.activity });
  };
}
