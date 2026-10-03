import type { ReactNode } from 'react';
import { useUnlinkWallet } from '@/wallet/use-link-wallet';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent, DialogTrigger } from '@/components/ui/dialog';

type UnlinkWalletDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Element that opens the dialog. Leave it out when something else, like a menu item, sets `open`. */
  trigger?: ReactNode;
  /** Without a trigger there is nothing to return focus to, so the opener says where it goes. */
  onCloseAutoFocus?: (event: Event) => void;
};

/** Confirms before removing the payout wallet from the account. */
export function UnlinkWalletDialog({ open, onOpenChange, trigger, onCloseAutoFocus }: UnlinkWalletDialogProps) {
  const unlink = useUnlinkWallet();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent
        onCloseAutoFocus={onCloseAutoFocus}
        title="Unlink this wallet?"
        description="Payouts for pull requests merged while no wallet is linked are held until you link one again."
      >
        <div className="flex justify-end gap-2">
          <DialogClose asChild>
            <Button size="sm">Cancel</Button>
          </DialogClose>
          <Button
            size="sm"
            variant="danger"
            pending={unlink.isPending}
            onClick={() => unlink.mutate(undefined, { onSuccess: () => onOpenChange(false) })}
          >
            Unlink wallet
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
