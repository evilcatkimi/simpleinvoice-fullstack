import { createBrowserRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { createQueryClient } from '@/core/api/query-client';
import { AppProviders } from './providers';
import { routes } from './route-table';

const queryClient = createQueryClient();
const router = createBrowserRouter(routes);

export function App() {
  return (
    <AppProviders queryClient={queryClient}>
      <RouterProvider router={router} />
    </AppProviders>
  );
}
