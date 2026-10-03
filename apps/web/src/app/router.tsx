import { createBrowserRouter } from 'react-router';
import { RequireAuth, RequireMaintainer } from './guards';
import { RootLayout } from './root-layout';
import { RouteError } from './route-error';
import { LandingPage } from '@/pages/landing/landing-page';
import { BountiesPage } from '@/pages/bounties/bounties-page';
import { BountyPage } from '@/pages/bounties/bounty-page';
import { SignInPage } from '@/pages/auth/sign-in-page';
import { AccountPage } from '@/pages/account/account-page';
import { DashboardPage } from '@/pages/dashboard/dashboard-page';
import { NewBountyPage } from '@/pages/dashboard/new-bounty-page';
import { NotFoundPage } from '@/pages/not-found-page';

export const router = createBrowserRouter([
  {
    element: <RootLayout />,
    errorElement: <RouteError />,
    children: [
      { index: true, element: <LandingPage /> },
      { path: 'bounties', element: <BountiesPage /> },
      { path: 'bounties/:number', element: <BountyPage /> },
      { path: 'sign-in', element: <SignInPage /> },
      {
        element: <RequireAuth />,
        children: [
          { path: 'account', element: <AccountPage /> },
          {
            element: <RequireMaintainer />,
            children: [
              { path: 'dashboard', element: <DashboardPage /> },
              { path: 'dashboard/new', element: <NewBountyPage /> },
            ],
          },
        ],
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);
