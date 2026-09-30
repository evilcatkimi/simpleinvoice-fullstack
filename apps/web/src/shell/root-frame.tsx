import { Outlet, ScrollRestoration } from 'react-router';

export function RootFrame() {
  return (
    <>
      {/* New screens start at the top; back/forward restores the previous scroll position. */}
      <ScrollRestoration />
      <Outlet />
    </>
  );
}
