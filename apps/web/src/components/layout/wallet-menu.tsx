import { useRef, useState } from 'react';
import { Link } from 'react-router';
import type { LinkedWallet } from '@escrow/shared';
import { ArrowUpRight, ChevronDown, Copy, Settings2, Unlink } from 'lucide-react';
import { toast } from 'sonner';
import { addressUrl } from '@/lib/explorer';
import { shortKey } from '@/lib/format';
import { UnlinkWalletDialog } from '@/components/wallet/unlink-wallet-dialog';
import { WalletBalanceRows } from '@/components/wallet/wallet-balance';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

async function copyAddress(address: string) {
  try {
    await navigator.clipboard.writeText(address);
    toast.success('Address copied', { description: shortKey(address, 6) });
  } catch (error) {
    toast.error('Could not copy', { description: error instanceof Error ? error.message : String(error) });
  }
}

/** The linked payout wallet in the top bar: balance at a glance, and a way to unlink it. */
export function WalletMenu({ wallet }: { wallet: LinkedWallet }) {
  const [unlinkOpen, setUnlinkOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          ref={triggerRef}
          aria-label={`Payout wallet ${shortKey(wallet.address)}`}
          className="group hidden h-8 items-center gap-2 rounded-full border bg-surface-1 pr-2 pl-3 text-[13px] text-fg-muted transition-colors duration-120 hover:text-fg data-[state=open]:text-fg sm:inline-flex"
        >
          <span className="size-1.5 rounded-full bg-ok" aria-hidden />
          <span className="data">{shortKey(wallet.address)}</span>
          <ChevronDown
            className="size-3.5 text-fg-subtle transition-transform duration-120 group-data-[state=open]:rotate-180"
            aria-hidden
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-64">
          <DropdownMenuLabel>
            <p className="label">Payout wallet</p>
            <p className="data mt-1 truncate text-[13px] text-fg">{shortKey(wallet.address, 8)}</p>
          </DropdownMenuLabel>
          <WalletBalanceRows address={wallet.address} />
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => void copyAddress(wallet.address)}>
            <Copy />
            Copy address
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <a href={addressUrl(wallet.address)} target="_blank" rel="noreferrer">
              <ArrowUpRight />
              View in explorer
            </a>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link to="/account#wallet">
              <Settings2 />
              Manage wallet
            </Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={() => setUnlinkOpen(true)}
            className="text-danger data-[highlighted]:bg-danger/10 data-[highlighted]:text-danger"
          >
            <Unlink />
            Unlink wallet
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <UnlinkWalletDialog
        open={unlinkOpen}
        onOpenChange={setUnlinkOpen}
        onCloseAutoFocus={(event) => {
          // The menu item that opened the dialog is gone by now; land on the wallet button instead.
          event.preventDefault();
          triggerRef.current?.focus();
        }}
      />
    </>
  );
}
