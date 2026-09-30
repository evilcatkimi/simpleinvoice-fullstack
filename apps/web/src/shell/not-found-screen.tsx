import { FileQuestion } from 'lucide-react';
import { ButtonLink } from '@/ui/button';
import { Card } from '@/ui/card';
import { EmptyState } from '@/ui/feedback';
import { useDocumentTitle } from '@/ui/hooks/use-document-title';

export function NotFoundScreen() {
  useDocumentTitle('Page not found');
  return (
    <Card>
      <EmptyState
        icon={FileQuestion}
        title="Page not found"
        titleAs="h1"
        description="The page you are looking for does not exist or has been moved."
        action={<ButtonLink to="/invoices">Go to invoices</ButtonLink>}
      />
    </Card>
  );
}
