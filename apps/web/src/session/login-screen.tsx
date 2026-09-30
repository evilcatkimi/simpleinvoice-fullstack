import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { Navigate, useLocation } from 'react-router';
import { getErrorMessage } from '@/core/api/api-client';
import { Button } from '@/ui/button';
import { Card } from '@/ui/card';
import { Alert, PageSpinner } from '@/ui/feedback';
import { Field, Input } from '@/ui/form-controls';
import { useDocumentTitle } from '@/ui/hooks/use-document-title';
import { Logo } from '@/ui/logo';
import { loginFormSchema } from './login-form';
import { getPostLoginPath } from './safe-redirect';
import { useCurrentUser, useLogin } from './session-hooks';

export function LoginScreen() {
  useDocumentTitle('Sign in');
  const location = useLocation();
  const { user, status } = useCurrentUser();
  const login = useLogin();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(loginFormSchema),
    defaultValues: { email: '', password: '' },
  });

  if (status === 'pending') return <PageSpinner label="Loading…" />;
  // Covers "already signed in" and "just signed in" alike: the cached user drives the redirect.
  if (user) return <Navigate to={getPostLoginPath(location.state)} replace />;

  const onSubmit = handleSubmit(async (credentials) => {
    try {
      await login.mutateAsync(credentials);
    } catch (error) {
      // Drop the failed attempt (its variables are the credentials) while the screen stays open.
      login.reset();
      setError('root.server', { message: getErrorMessage(error) });
    }
  });

  const serverError = errors.root?.server?.message;

  return (
    <main className="flex min-h-dvh items-center justify-center bg-slate-50 px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <Logo className="size-11" />
          <h1 className="mt-5 text-2xl font-semibold tracking-tight text-slate-900">
            Sign in to SimpleInvoice
          </h1>
          <p className="mt-1.5 text-sm text-slate-600">
            Welcome back. Enter your details to manage your invoices.
          </p>
        </div>

        <Card className="p-6 shadow-sm sm:p-8">
          <form noValidate onSubmit={onSubmit} className="space-y-5">
            {serverError && <Alert title="Sign in failed" messages={[serverError]} />}
            <Field label="Email" error={errors.email?.message}>
              {(control) => (
                <Input
                  {...control}
                  {...register('email')}
                  type="email"
                  autoComplete="username"
                  placeholder="you@company.com"
                />
              )}
            </Field>
            <Field label="Password" error={errors.password?.message}>
              {(control) => (
                <Input
                  {...control}
                  {...register('password')}
                  type="password"
                  autoComplete="current-password"
                />
              )}
            </Field>
            <Button type="submit" className="w-full" loading={isSubmitting}>
              Sign in
            </Button>
          </form>
        </Card>
      </div>
    </main>
  );
}
