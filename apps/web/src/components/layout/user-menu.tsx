import { Link, useNavigate } from 'react-router';
import type { User } from '@escrow/shared';
import { ArrowUpRight, LayoutDashboard, LogOut, UserRound } from 'lucide-react';
import { toast } from 'sonner';
import { useProject, useSignOut } from '@/api/queries';
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
  const navigate = useNavigate();
  const signOut = useSignOut();
  const project = useProject();

  const onSignOut = () =>
    signOut.mutate(undefined, {
      onSuccess: () => {
        toast.success('Signed out');
        void navigate('/');
      },
      onError: (error) => toast.error('Could not sign out', { description: error.message }),
    });

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
            <span>{user.role === 'maintainer' ? 'Maintainer' : 'Developer'}</span>
          </p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {user.role === 'maintainer' && (
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
        {project.data && (
          <DropdownMenuItem asChild>
            <a href={project.data.url} target="_blank" rel="noreferrer">
              <ArrowUpRight />
              Repository on GitHub
            </a>
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onSignOut} disabled={signOut.isPending}>
          <LogOut />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
