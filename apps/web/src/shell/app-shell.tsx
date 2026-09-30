import { clsx } from 'clsx';
import { LogOut } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { toast } from 'sonner';
import { useCurrentUser, useLogout } from '@/session/session-hooks';
import { Button } from '@/ui/button';
import { focusRingClassName } from '@/ui/class-names';
import { Logo } from '@/ui/logo';

function initials(fullname: string): string {
  return fullname
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
}

export function AppShell() {
  const { user } = useCurrentUser();
  const logout = useLogout();
  const navigate = useNavigate();
  const mainRef = useFocusOnNavigation();

  const signOut = () => {
    logout.mutate(undefined, {
      onSuccess: () => void navigate('/login', { replace: true }),
      onError: () => toast.error('Sign out failed. Please try again.'),
    });
  };

  return (
    <div className="min-h-dvh bg-slate-50">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-slate-900 focus:shadow-lg"
      >
        Skip to main content
      </a>

      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-6 px-4 sm:px-6 lg:px-8">
          <Link
            to="/invoices"
            className={clsx('flex items-center gap-2.5 rounded-md', focusRingClassName)}
          >
            <Logo className="size-8" />
            <span className="text-base font-semibold tracking-tight text-slate-900">
              SimpleInvoice
            </span>
          </Link>

          <nav aria-label="Main" className="hidden sm:block">
            <NavLink
              to="/invoices"
              className={({ isActive }) =>
                clsx(
                  'rounded-md px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-slate-100 text-slate-900'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900',
                  focusRingClassName,
                )
              }
            >
              Invoices
            </NavLink>
          </nav>

          <div className="ml-auto flex items-center gap-2 sm:gap-4">
            {user && (
              <p className="flex items-center gap-2.5">
                <span
                  aria-hidden="true"
                  className="flex size-8 items-center justify-center rounded-full bg-blue-50 text-xs font-semibold text-blue-700 ring-1 ring-blue-100"
                >
                  {initials(user.fullname)}
                </span>
                <span className="sr-only text-sm font-medium text-slate-700 md:not-sr-only">
                  <span className="sr-only">Signed in as </span>
                  {user.fullname}
                </span>
              </p>
            )}
            <Button variant="ghost" size="sm" onClick={signOut} disabled={logout.isPending}>
              <LogOut aria-hidden="true" className="size-4" />
              <span className="sr-only sm:not-sr-only">Sign out</span>
            </Button>
          </div>
        </div>
      </header>

      <main
        ref={mainRef}
        id="main-content"
        tabIndex={-1}
        className="mx-auto max-w-7xl px-4 py-6 focus:outline-none sm:px-6 sm:py-8 lg:px-8"
      >
        <Outlet />
      </main>
    </div>
  );
}

/**
 * After an in-app navigation, focus stays on the link that was clicked, or drops to <body> when
 * that link unmounts: move it to the new screen instead, so keyboard and screen-reader users
 * start reading there. Only the pathname counts: filtering the list changes the query string
 * and must not pull focus out of the search box.
 */
function useFocusOnNavigation() {
  const { pathname } = useLocation();
  const mainRef = useRef<HTMLElement>(null);
  // Starts at the first pathname, so the initial render (a page load or sign-in) moves nothing.
  const focusedPathname = useRef(pathname);

  useEffect(() => {
    if (pathname === focusedPathname.current) return;
    focusedPathname.current = pathname;
    // preventScroll: scroll position is ScrollRestoration's job (top, or restored on "Back").
    mainRef.current?.focus({ preventScroll: true });
  }, [pathname]);

  return mainRef;
}
