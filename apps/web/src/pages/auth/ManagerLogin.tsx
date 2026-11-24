import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Mail, Lock, ArrowRight, ShieldAlert } from 'lucide-react';
import toast from 'react-hot-toast';
import { AuthLayout } from '@/layouts/AuthLayout';
import { Button, Input } from '@/components/ui';
import { useAuthStore } from '@/stores/authStore';

const managerLoginSchema = z.object({
  email: z.string().email('Enter your assigned manager email'),
  password: z.string().min(1, 'Password is required'),
});

type ManagerLoginForm = z.infer<typeof managerLoginSchema>;

export function ManagerLogin() {
  const navigate = useNavigate();
  const { login, error, clearError } = useAuthStore();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ManagerLoginForm>({
    resolver: zodResolver(managerLoginSchema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = async (values: ManagerLoginForm) => {
    clearError();
    try {
      await login(values.email, values.password, 'MANAGER');
      toast.success('Signed in to Outlet Manager Console');
      navigate('/manager/dashboard');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Invalid manager credentials';
      toast.error(msg);
    }
  };

  return (
    <AuthLayout
      portal="manager"
      title="Outlet Manager Sign In"
      subtitle="Access your assigned outlet kitchen dashboard, menu & inventory."
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        {error && (
          <div
            role="alert"
            className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-medium text-red-700 dark:border-red-900/50 dark:bg-red-950/50 dark:text-red-300"
          >
            {error}
          </div>
        )}

        <Input
          label="Manager Email"
          type="email"
          placeholder="manager1@campus.com"
          autoComplete="email"
          icon={<Mail className="h-4 w-4" />}
          error={errors.email?.message}
          {...register('email')}
        />

        <Input
          label="Password"
          type="password"
          placeholder="••••••••"
          autoComplete="current-password"
          icon={<Lock className="h-4 w-4" />}
          error={errors.password?.message}
          {...register('password')}
        />

        <Button
          type="submit"
          variant="primary"
          size="lg"
          fullWidth
          loading={isSubmitting}
          className="bg-ops-600 hover:bg-ops-700 dark:bg-ops-600 dark:hover:bg-ops-700"
          rightIcon={<ArrowRight className="h-4 w-4" />}
        >
          Launch Outlet Console
        </Button>

        <div className="flex items-start gap-2 rounded-xl border border-amber-200/70 bg-amber-50/70 p-3 text-xs text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-300">
          <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5" />
          <span>
            Manager accounts are provisioned exclusively by the Super Admin and scoped to a single assigned outlet.
          </span>
        </div>
      </form>
    </AuthLayout>
  );
}

export default ManagerLogin;
