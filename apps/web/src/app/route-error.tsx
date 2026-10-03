import { isRouteErrorResponse, Link, useRouteError } from 'react-router';
import { Button } from '@/components/ui/button';
import { Container } from '@/components/layout/container';

/** Last-resort boundary. Shows what broke instead of a blank page; the error is already in the console. */
export function RouteError() {
  const error = useRouteError();
  const message = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : error instanceof Error
      ? error.message
      : String(error);

  return (
    <Container className="flex min-h-dvh flex-col justify-center py-20">
      <p className="label">Something broke</p>
      <h1 className="mt-3 text-title font-semibold">This page failed to render.</h1>
      <pre className="data mt-4 max-w-2xl overflow-x-auto rounded-md border bg-surface-1 p-4 text-[13px] text-danger">{message}</pre>
      <div className="mt-6 flex gap-2">
        <Button variant="primary" onClick={() => window.location.reload()}>
          Reload
        </Button>
        <Button asChild>
          <Link to="/">Go home</Link>
        </Button>
      </div>
    </Container>
  );
}
