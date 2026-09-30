import { Plus } from 'lucide-react';
import { useLocation } from 'react-router';
import { ButtonLink } from '@/ui/button';
import { Card } from '@/ui/card';
import { useDocumentTitle } from '@/ui/hooks/use-document-title';
import { PageHeader } from '@/ui/page-header';
import { returnToListState } from '../common/return-to-list';
import { useInvoices } from '../data/invoice-queries';
import { hasActiveFilters } from '../model/list-query';
import { InvoiceResults } from './invoice-results';
import { ListToolbar } from './list-toolbar';
import { announceResults } from './results-announcement';
import { useListQuery } from './use-list-query';

export function InvoiceListScreen() {
  useDocumentTitle('Invoices');
  const location = useLocation();
  const { params, updateParams, clearFilters } = useListQuery();
  const invoicesQuery = useInvoices(params);
  // Detail and create screens use this to return to the exact same list view.
  const linkState = returnToListState(location.search);

  return (
    <>
      <PageHeader
        title="Invoices"
        description="Search, filter and review every invoice in the system."
        actions={
          <ButtonLink to="/invoices/new" state={linkState}>
            <Plus aria-hidden="true" className="size-4" />
            New invoice
          </ButtonLink>
        }
      />

      <Card className="mb-4 p-4 sm:p-5">
        <ListToolbar params={params} onChange={updateParams} onReset={clearFilters} />
      </Card>

      {/* Mounted for as long as the screen, unlike the results it describes: a live region only
          announces changes to content it already had. */}
      <p role="status" className="sr-only">
        {announceResults(invoicesQuery, hasActiveFilters(params))}
      </p>

      <Card aria-busy={invoicesQuery.isFetching} className="overflow-hidden">
        <InvoiceResults
          query={invoicesQuery}
          params={params}
          onParamsChange={updateParams}
          onClearFilters={clearFilters}
          linkState={linkState}
        />
      </Card>
    </>
  );
}
