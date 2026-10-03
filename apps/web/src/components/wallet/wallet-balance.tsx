import type { TokenAmount } from '@escrow/shared';
import { RefreshCw, RotateCw } from 'lucide-react';
import { cn } from '@/lib/cn';
import { formatUnits } from '@/lib/format';
import { useWalletBalance } from '@/wallet/use-wallet-balance';
import { Amount } from '@/components/common/amount';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip } from '@/components/ui/tooltip';

/** SOL is not a reward, so it stays out of amber. */
function SolAmount({ value, hideSymbol, className }: { value: TokenAmount; hideSymbol?: boolean; className?: string }) {
  return (
    <span className={cn('data whitespace-nowrap text-fg', className)}>
      {formatUnits(value.amount, value.decimals)}
      {!hideSymbol && <span className="ml-[0.35em] text-[0.72em] font-medium tracking-wide opacity-80">{value.symbol}</span>}
    </span>
  );
}

/** Both balances of the linked wallet with a refresh, for the account page. */
export function WalletBalancePanel({ address }: { address: string }) {
  const balance = useWalletBalance(address);

  if (balance.isError) {
    return (
      <div role="alert" className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3.5">
        <div className="min-w-0">
          <p className="text-[13px] font-medium text-fg">Could not read the wallet balance.</p>
          <p className="mt-0.5 text-[13px] break-words text-fg-muted">{balance.error.message}</p>
        </div>
        <Button size="sm" onClick={() => void balance.refetch()} pending={balance.isFetching}>
          {!balance.isFetching && <RotateCw />}
          Try again
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-4 border-t px-4 py-3.5">
      <dl className="flex min-w-0 flex-1 flex-wrap gap-x-10 gap-y-3">
        <div className="min-w-0">
          <dt className="label">OMT balance</dt>
          <dd className="mt-1.5 flex h-7 items-center">
            {balance.data ? <Amount value={balance.data.token} large className="text-[18px]" /> : <Skeleton className="h-5 w-28" />}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="label">SOL balance</dt>
          <dd className="mt-1.5 flex h-7 items-center">
            {balance.data ? <SolAmount value={balance.data.sol} className="text-[18px]" /> : <Skeleton className="h-5 w-20" />}
          </dd>
        </div>
      </dl>
      <Tooltip content="Refresh balance">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Refresh balance"
          disabled={balance.isFetching}
          onClick={() => void balance.refetch()}
        >
          <RefreshCw className={cn(balance.isFetching && 'animate-spin')} />
        </Button>
      </Tooltip>
    </div>
  );
}

/** Compact balance rows for the wallet menu. */
export function WalletBalanceRows({ address }: { address: string }) {
  const balance = useWalletBalance(address);

  if (balance.isError) {
    return (
      <p role="alert" className="px-2.5 py-2 text-[13px] text-danger">
        Could not read the balance. Open Account to retry.
      </p>
    );
  }

  return (
    <dl className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 gap-y-1.5 px-2.5 py-2 text-[13px]">
      <dt className="text-fg-subtle">OMT</dt>
      <dd className="flex justify-end">
        {balance.data ? <Amount value={balance.data.token} hideSymbol /> : <Skeleton className="h-4 w-20" />}
      </dd>
      <dt className="text-fg-subtle">SOL</dt>
      <dd className="flex justify-end">
        {balance.data ? <SolAmount value={balance.data.sol} hideSymbol /> : <Skeleton className="h-4 w-14" />}
      </dd>
    </dl>
  );
}
