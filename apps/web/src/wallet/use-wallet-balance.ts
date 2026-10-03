import { useQuery } from '@tanstack/react-query';
import { env } from '@/lib/env';
import { readWalletBalance } from './solana-rpc';

export const REWARD_SYMBOL = 'OMT';

/** SOL and reward-token balance of `address`, read from the cluster by the browser. */
export function useWalletBalance(address: string) {
  return useQuery({
    queryKey: ['wallet-balance', env.solanaRpcUrl, address],
    queryFn: () => readWalletBalance(address, { rpcUrl: env.solanaRpcUrl, mint: env.tokenMint, symbol: REWARD_SYMBOL }),
    staleTime: 30_000,
  });
}
