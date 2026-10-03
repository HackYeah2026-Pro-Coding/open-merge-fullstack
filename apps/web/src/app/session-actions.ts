import { useNavigate } from 'react-router';
import type { User } from '@escrow/shared';
import { toast } from 'sonner';
import { useOpenOwnerView, useSignOut } from '@/api/queries';

/** Opens the project owner view. Navigates to `to` once the owner session is active, if given. */
export function useOwnerViewAction() {
  const open = useOpenOwnerView();
  const navigate = useNavigate();
  return {
    pending: open.isPending,
    open: (to?: string) =>
      open.mutate(undefined, {
        onSuccess: () => {
          toast.success('Owner view opened', { description: 'You are managing bounties as the project owner.' });
          if (to) void navigate(to);
        },
        onError: (error) => toast.error('Could not open the owner view', { description: error.message }),
      }),
  };
}

/**
 * Leaving the owner view returns to the developer view exactly as it was, signed
 * in or not. Otherwise this signs the developer out.
 */
export function useSignOutAction() {
  const signOut = useSignOut();
  const navigate = useNavigate();
  return {
    pending: signOut.isPending,
    run: (user: User) => {
      const leavingOwnerView = user.role === 'maintainer';
      signOut.mutate(() => void navigate(leavingOwnerView ? '/bounties' : '/'), {
        onSuccess: () => toast.success(leavingOwnerView ? 'Back to the developer view' : 'Signed out'),
        onError: (error) =>
          toast.error(leavingOwnerView ? 'Could not leave the owner view' : 'Could not sign out', {
            description: error.message,
          }),
      });
    },
  };
}
