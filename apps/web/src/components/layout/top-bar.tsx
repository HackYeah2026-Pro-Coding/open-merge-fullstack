import { Link, NavLink, useLocation } from 'react-router';
import type { User } from '@escrow/shared';
import { Menu, Wallet, X } from 'lucide-react';
import { useSession } from '@/api/queries';
import { useSignOutAction } from '@/app/session-actions';
import { cn } from '@/lib/cn';
import { shortKey } from '@/lib/format';
import { LogoMark } from '@/components/common/icons';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip } from '@/components/ui/tooltip';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { ThemeToggle } from './theme-toggle';
import { UserMenu } from './user-menu';

function navItems(user: User | null | undefined) {
  return [
    { to: '/bounties', label: 'Bounties' },
    ...(user?.role === 'maintainer' ? [{ to: '/dashboard', label: 'Dashboard' }] : []),
    ...(user ? [{ to: '/account', label: 'Account' }] : []),
  ];
}

export function Logo() {
  return (
    <Link to="/" className="flex items-center gap-2 rounded-sm text-fg" aria-label="OpenMerge home">
      <LogoMark className="size-[22px]" />
      <span className="text-[15px] font-semibold tracking-[-0.01em]">OpenMerge</span>
    </Link>
  );
}

function WalletChip({ user }: { user: User }) {
  if (user.wallet) {
    return (
      <Tooltip content="Payouts go to this wallet">
        <Link
          to="/account"
          className="hidden h-8 items-center gap-2 rounded-full border bg-surface-1 px-3 text-[13px] text-fg-muted transition-colors duration-120 hover:text-fg sm:inline-flex"
        >
          <span className="size-1.5 rounded-full bg-ok" aria-hidden />
          <span className="data">{shortKey(user.wallet.address)}</span>
        </Link>
      </Tooltip>
    );
  }
  return (
    <Button asChild size="sm" variant="secondary" className="hidden sm:inline-flex">
      <Link to="/account#wallet">
        <Wallet />
        Link wallet
      </Link>
    </Button>
  );
}

/** Marks the owner view so it is never mistaken for a developer's screen, and leaves it in one click. */
function OwnerViewPill({ user }: { user: User }) {
  const signOut = useSignOutAction();
  return (
    <Tooltip content="Back to the developer view">
      <button
        type="button"
        onClick={() => signOut.run(user)}
        disabled={signOut.pending}
        className="hidden h-8 items-center gap-2 rounded-full border border-brand/35 bg-brand/10 pr-2 pl-3 text-[13px] font-medium text-brand transition-colors duration-120 hover:bg-brand/15 disabled:opacity-60 sm:inline-flex"
      >
        <span className="size-1.5 rounded-full bg-brand" aria-hidden />
        Owner view
        <X className="size-3.5" aria-hidden />
        <span className="sr-only">: exit</span>
      </button>
    </Tooltip>
  );
}

export function TopBar() {
  const session = useSession();
  const location = useLocation();
  const user = session.data?.user;
  const items = navItems(user);
  const next = encodeURIComponent(location.pathname + location.search);

  return (
    <header className="sticky top-0 z-40 h-14 border-b bg-bg/85 backdrop-blur-md supports-[backdrop-filter]:bg-bg/70">
      <div className="mx-auto flex h-full w-full max-w-6xl items-center gap-6 px-4 sm:px-6">
        <Logo />
        <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  'rounded-sm px-2.5 py-1.5 text-ui transition-colors duration-120',
                  isActive ? 'text-fg' : 'text-fg-muted hover:text-fg',
                )
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle />
          {session.isPending ? (
            <Skeleton className="size-[30px] rounded-full" />
          ) : user ? (
            <>
              {user.role === 'developer' ? <WalletChip user={user} /> : <OwnerViewPill user={user} />}
              <UserMenu user={user} />
            </>
          ) : (
            location.pathname !== '/sign-in' && (
              <Button asChild size="sm" variant="primary">
                <Link to={`/sign-in?next=${next}`}>Sign in</Link>
              </Button>
            )
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" className="md:hidden" aria-label="Open navigation">
                <Menu />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="min-w-44">
              {items.map((item) => (
                <DropdownMenuItem key={item.to} asChild>
                  <Link to={item.to}>{item.label}</Link>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
