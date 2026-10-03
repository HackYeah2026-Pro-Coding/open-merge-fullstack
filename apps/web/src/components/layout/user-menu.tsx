import { Link } from 'react-router';
import type { User } from '@escrow/shared';
import { ArrowUpRight, LayoutDashboard, LogOut, UserRound } from 'lucide-react';
import { useProject } from '@/api/queries';
import { useOwnerViewAction, useSignOutAction } from '@/app/session-actions';
import { Avatar } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export function UserMenu({ user }: { user: User }) {
  const project = useProject();
  const signOut = useSignOutAction();
  const owner = useOwnerViewAction();
  const isOwner = user.role === 'maintainer';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="flex items-center rounded-full transition-opacity duration-120 hover:opacity-85"
        aria-label={`Account menu for ${user.githubLogin}`}
      >
        <Avatar login={user.githubLogin} src={user.avatarUrl} size={30} />
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuLabel>
          <p className="truncate font-medium text-fg">{user.name ?? user.githubLogin}</p>
          <p className="mt-0.5 flex items-center gap-1.5 text-[13px] text-fg-subtle">
            <span className="data">@{user.githubLogin}</span>
            <span aria-hidden>·</span>
            <span>{isOwner ? 'Project owner' : 'Developer'}</span>
          </p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {isOwner && (
          <DropdownMenuItem asChild>
            <Link to="/dashboard">
              <LayoutDashboard />
              Dashboard
            </Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem asChild>
          <Link to="/account">
            <UserRound />
            Account
          </Link>
        </DropdownMenuItem>
        {!isOwner && (
          <DropdownMenuItem onSelect={() => owner.open('/dashboard')} disabled={owner.pending}>
            <LayoutDashboard />
            Open owner view
          </DropdownMenuItem>
        )}
        {project.data && (
          <DropdownMenuItem asChild>
            <a href={project.data.url} target="_blank" rel="noreferrer">
              <ArrowUpRight />
              Repository on GitHub
            </a>
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => signOut.run(user)} disabled={signOut.pending}>
          <LogOut />
          {isOwner ? 'Exit owner view' : 'Sign out'}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
