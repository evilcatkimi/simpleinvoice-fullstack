import { CircleAlert } from 'lucide-react';
import { Button } from '@/ui/button';
import { Card } from '@/ui/card';

// Route error boundaries: the last line of defence for rendering bugs. API errors never get this
// far; each screen handles its own.

/** Replaces the whole page: something outside the app shell (sign-in, the shell itself) crashed. */
export function CrashScreen() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-slate-50 px-4">
      <CrashNotice />
    </main>
  );
}

/** Replaces only the screen that crashed, so the header, navigation and Sign out stay usable. */
export function CrashPanel() {
  return (
    <div className="flex justify-center py-6 sm:py-12">
      <CrashNotice />
    </div>
  );
}

function CrashNotice() {
  return (
    <Card role="alert" className="w-full max-w-md px-6 py-10 text-center">
      <CircleAlert aria-hidden="true" className="mx-auto size-10 text-red-600" />
      <h1 className="mt-4 text-lg font-semibold text-slate-900">Something went wrong</h1>
      <p className="mt-1 text-sm text-slate-600">
        An unexpected error occurred. Reload the page to try again.
      </p>
      <Button className="mt-6" onClick={() => window.location.reload()}>
        Reload page
      </Button>
    </Card>
  );
}
