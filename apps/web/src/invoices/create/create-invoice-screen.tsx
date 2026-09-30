import { zodResolver } from '@hookform/resolvers/zod';
import { Info } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useLocation, useNavigate } from 'react-router';
import { toast } from 'sonner';
import { getErrorMessage, isApiError } from '@/core/api/api-client';
import { Button, ButtonLink } from '@/ui/button';
import { CardSection } from '@/ui/card';
import { Alert } from '@/ui/feedback';
import { Field, Input, Select, Textarea } from '@/ui/form-controls';
import { useDocumentTitle } from '@/ui/hooks/use-document-title';
import { PageHeader } from '@/ui/page-header';
import { getReturnToListPath } from '../common/return-to-list';
import { FALLBACK_CURRENCIES, useCreateInvoice, useCurrencies } from '../data/invoice-queries';
import {
  createInvoiceFormDefaults,
  createInvoiceFormSchema,
  toCreateInvoiceRequest,
} from '../model/create-invoice-form';

export function CreateInvoiceScreen() {
  useDocumentTitle('New invoice');
  const navigate = useNavigate();
  const location = useLocation();
  const backTo = getReturnToListPath(location.state);
  const createInvoice = useCreateInvoice();
  const currencies = useCurrencies().data ?? FALLBACK_CURRENCIES;
  // Computed once: "today" must not move if the page stays open past midnight while editing.
  const [defaultValues] = useState(createInvoiceFormDefaults);
  const [submitErrors, setSubmitErrors] = useState<string[]>();
  const alertRef = useRef<HTMLDivElement>(null);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(createInvoiceFormSchema),
    defaultValues,
    mode: 'onTouched',
  });

  // Move keyboard and screen-reader users to the server's explanation when a save fails.
  useEffect(() => {
    if (submitErrors) alertRef.current?.focus();
  }, [submitErrors]);

  const onSubmit = handleSubmit(async (values) => {
    setSubmitErrors(undefined);
    try {
      const invoice = await createInvoice.mutateAsync(toCreateInvoiceRequest(values));
      toast.success(`Invoice ${invoice.invoiceNumber} created`);
      // The unfiltered list, not `backTo`: sorted newest first, it shows the new invoice (dated
      // today by default) at the top, while the list the user came from may filter it out.
      void navigate('/invoices');
    } catch (error) {
      if (isApiError(error, 409)) {
        setError(
          'invoiceNumber',
          { type: 'server', message: 'Invoice number already exists' },
          { shouldFocus: true },
        );
      } else {
        setSubmitErrors(isApiError(error, 400) ? error.messages : [getErrorMessage(error)]);
      }
    }
  });

  return (
    <>
      <PageHeader
        title="New invoice"
        description="New invoices are saved as Draft."
        back={{ to: backTo, label: 'Back to invoices' }}
      />

      <form noValidate onSubmit={onSubmit} className="space-y-6">
        {submitErrors && (
          <Alert
            ref={alertRef}
            tabIndex={-1}
            title="The invoice could not be created"
            messages={submitErrors}
          />
        )}

        {/* items-start: each card keeps its natural height instead of stretching to its neighbour. */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:items-start">
          <CardSection title="Customer">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Customer name" required error={errors.customer?.fullname?.message}>
                {(control) => (
                  <Input {...control} {...register('customer.fullname')} autoComplete="off" />
                )}
              </Field>
              <Field label="Customer email" required error={errors.customer?.email?.message}>
                {(control) => (
                  <Input
                    {...control}
                    {...register('customer.email')}
                    type="email"
                    autoComplete="off"
                  />
                )}
              </Field>
              <Field label="Mobile number" error={errors.customer?.mobileNumber?.message}>
                {(control) => (
                  <Input
                    {...control}
                    {...register('customer.mobileNumber')}
                    type="tel"
                    autoComplete="off"
                  />
                )}
              </Field>
              <Field
                label="Address"
                error={errors.customer?.address?.message}
                className="sm:col-span-2"
              >
                {(control) => <Textarea {...control} {...register('customer.address')} rows={3} />}
              </Field>
            </div>
          </CardSection>

          <CardSection title="Invoice details">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Invoice number"
                required
                hint="Must be unique, e.g. INV-2026-0100"
                error={errors.invoiceNumber?.message}
              >
                {(control) => (
                  <Input {...control} {...register('invoiceNumber')} autoComplete="off" />
                )}
              </Field>
              <Field
                label="Reference"
                hint="Optional, e.g. a purchase order number"
                error={errors.invoiceReference?.message}
              >
                {(control) => (
                  <Input {...control} {...register('invoiceReference')} autoComplete="off" />
                )}
              </Field>
              <Field label="Invoice date" required error={errors.invoiceDate?.message}>
                {(control) => <Input {...control} {...register('invoiceDate')} type="date" />}
              </Field>
              <Field label="Due date" required error={errors.dueDate?.message}>
                {(control) => <Input {...control} {...register('dueDate')} type="date" />}
              </Field>
              <Field
                label="Currency"
                required
                error={errors.currency?.message}
                className="sm:col-span-2"
              >
                {(control) => (
                  <Select {...control} {...register('currency')}>
                    {currencies.map((currency) => (
                      <option key={currency.code} value={currency.code}>
                        {currency.code} — {currency.name} ({currency.symbol})
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <Field
                label="Description"
                error={errors.description?.message}
                className="sm:col-span-2"
              >
                {(control) => <Textarea {...control} {...register('description')} rows={3} />}
              </Field>
            </div>
          </CardSection>

          <CardSection title="Line item">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Item name"
                required
                error={errors.item?.name?.message}
                className="sm:col-span-2"
              >
                {(control) => <Input {...control} {...register('item.name')} autoComplete="off" />}
              </Field>
              <Field label="Quantity" required error={errors.item?.quantity?.message}>
                {(control) => (
                  <Input {...control} {...register('item.quantity')} inputMode="numeric" />
                )}
              </Field>
              <Field
                label="Rate"
                required
                hint="Unit price in the invoice currency"
                error={errors.item?.rate?.message}
              >
                {(control) => <Input {...control} {...register('item.rate')} inputMode="decimal" />}
              </Field>
            </div>
          </CardSection>

          <CardSection title="Adjustments">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Tax rate (%)"
                required
                hint="Standard rate is 10%. Enter 0 for no tax."
                error={errors.taxRate?.message}
              >
                {(control) => <Input {...control} {...register('taxRate')} inputMode="decimal" />}
              </Field>
              <Field
                label="Discount"
                hint="Amount in the invoice currency"
                error={errors.discount?.message}
              >
                {(control) => <Input {...control} {...register('discount')} inputMode="decimal" />}
              </Field>
              {/* The spec requires the backend to calculate totals; the form never shows its own. */}
              <p className="flex gap-2 rounded-lg bg-blue-50 p-3 text-sm text-blue-800 sm:col-span-2">
                <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                Totals are calculated by the server when the invoice is saved.
              </p>
            </div>
          </CardSection>
        </div>

        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <ButtonLink to={backTo} variant="secondary">
            Cancel
          </ButtonLink>
          <Button type="submit" loading={isSubmitting}>
            Create invoice
          </Button>
        </div>
      </form>
    </>
  );
}
