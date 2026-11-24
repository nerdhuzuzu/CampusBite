import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Mail, Lock, ArrowRight, ShieldCheck } from 'lucide-react';
import toast from 'react-hot-toast';
import { AuthLayout } from '@/layouts/AuthLayout';
import { Button, Input } from '@/components/ui';
import { useAuthStore } from '@/stores/authStore';

const adminLoginSchema = z.object({
  email: z.string().email('Enter a valid administrator email'),
  password: z.string().min(1, 'Password is required'),
});

type AdminLoginForm = z.infer<typeof adminLoginSchema>;

export function AdminLogin() {
  const navigate = useNavigate();
  const { login, error, clearError } = useAuthStore();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<AdminLoginForm>({
    resolver: zodResolver(adminLoginSchema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = async (values: AdminLoginForm) => {
    clearError();
    try {
      await login(values.email, values.password, 'SUPER_ADMIN');
      toast.success('Authenticated as Super Admin');
      navigate('/admin/dashboard');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Invalid administrator credentials';
      toast.error(msg);
    }
  };

  return (
    <AuthLayout
      portal="admin"
      title="Super Admin Command Center"
      subtitle="Centralized oversight for all campus food outlets, managers & audit logs."
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
          label="Administrator Email"
          type="email"
          placeholder="admin@campus.com"
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
          className="bg-hq-600 hover:bg-hq-700 dark:bg-hq-600 dark:hover:bg-hq-700"
          rightIcon={<ArrowRight className="h-4 w-4" />}
        >
          Sign In as Super Admin
        </Button>

        <div className="flex items-start gap-2 rounded-xl border border-indigo-200/70 bg-indigo-50/70 p-3 text-xs text-indigo-900 dark:border-indigo-900/40 dark:bg-indigo-950/30 dark:text-indigo-300">
          <ShieldCheck className="h-4 w-4 shrink-0 mt-0.5" />
          <span>
            All administrative actions are recorded in the immutable security audit trail.
          </span>
        </div>
      </form>
    </AuthLayout>
  );
}

export default AdminLogin;
