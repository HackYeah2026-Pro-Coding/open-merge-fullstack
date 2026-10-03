import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '@/api';
import { useApplyUser } from '@/api/queries';
import { shortKey } from '@/lib/format';
import { getPhantom, isUserRejection, toBase64 } from './phantom';

export type LinkStage = 'idle' | 'connecting' | 'signing' | 'saving';

/**
 * Proves wallet ownership: connect Phantom, sign a one-time challenge from the
 * API, then send the signature back. Signing is free and moves no funds.
 */
export function useLinkWallet(onStage: (stage: LinkStage) => void) {
  const applyUser = useApplyUser();

  return useMutation({
    mutationFn: async () => {
      const provider = getPhantom();
      if (!provider) throw new Error('Phantom is not installed in this browser.');

      onStage('connecting');
      const { publicKey } = await provider.connect();
      const address = publicKey.toString();

      const challenge = await api.createWalletChallenge(address);
      onStage('signing');
      const { signature } = await provider.signMessage(new TextEncoder().encode(challenge.message), 'utf8');

      onStage('saving');
      return api.linkWallet({ address, nonce: challenge.nonce, signature: toBase64(signature) });
    },
    onSuccess: (user) => {
      applyUser(user);
      toast.success('Wallet linked', {
        description: user.wallet ? `Payouts go to ${shortKey(user.wallet.address)}.` : undefined,
      });
    },
    onError: (error) => {
      toast.error(isUserRejection(error) ? 'Request cancelled in Phantom' : 'Could not link wallet', {
        description: isUserRejection(error) ? 'Nothing was changed.' : error.message,
      });
    },
    onSettled: () => onStage('idle'),
  });
}

export function useUnlinkWallet() {
  const applyUser = useApplyUser();
  return useMutation({
    mutationFn: () => api.unlinkWallet(),
    onSuccess: (user) => {
      applyUser(user);
      toast.success('Wallet unlinked', { description: 'Link a wallet again to receive payouts.' });
    },
    onError: (error) => toast.error('Could not unlink wallet', { description: error.message }),
  });
}
