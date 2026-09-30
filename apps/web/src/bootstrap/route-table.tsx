import { Navigate, type RouteObject } from 'react-router';
import { CreateInvoiceScreen } from '@/invoices/create/create-invoice-screen';
import { InvoiceDetailScreen } from '@/invoices/detail/invoice-detail-screen';
import { InvoiceListScreen } from '@/invoices/list/invoice-list-screen';
import { LoginScreen } from '@/session/login-screen';
import { SessionGuard } from '@/session/session-guard';
import { AppShell } from '@/shell/app-shell';
import { CrashPanel, CrashScreen } from '@/shell/error-boundaries';
import { NotFoundScreen } from '@/shell/not-found-screen';
import { RootFrame } from '@/shell/root-frame';

/** Route table, shared by the browser router and the in-memory router used in tests. */
export const routes: RouteObject[] = [
  {
    Component: RootFrame,
    ErrorBoundary: CrashScreen,
    children: [
      { path: 'login', Component: LoginScreen },
      {
        Component: SessionGuard,
        children: [
          // Redirects before the shell renders: it is not a navigation the user made inside it.
          { index: true, element: <Navigate to="/invoices" replace /> },
          {
            Component: AppShell,
            children: [
              {
                // A crashing screen is replaced inside the shell, not the whole page.
                ErrorBoundary: CrashPanel,
                children: [
                  { path: 'invoices', Component: InvoiceListScreen },
                  { path: 'invoices/new', Component: CreateInvoiceScreen },
                  { path: 'invoices/:invoiceId', Component: InvoiceDetailScreen },
                  { path: '*', Component: NotFoundScreen },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
];
