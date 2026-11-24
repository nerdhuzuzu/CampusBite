import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Mail, Lock, ArrowRight } from 'lucide-react';
import toast from 'react-hot-toast';
import { AuthLayout } from '@/layouts/AuthLayout';
import { Button, Input } from '@/components/ui';
import { useAuthStore } from '@/stores/authStore';

const studentLoginSchema = z.object({
  email: z.string().email('Enter a valid campus email address'),
  password: z.string().min(1, 'Password is required'),
});

type StudentLoginForm = z.infer<typeof studentLoginSchema>;

export function StudentLogin() {
  const navigate = useNavigate();
  const { login, error, clearError } = useAuthStore();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<StudentLoginForm>({
    resolver: zodResolver(studentLoginSchema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = async (values: StudentLoginForm) => {
    clearError();
    try {
      await login(values.email, values.password, 'STUDENT');
      toast.success('Welcome back to CampusBite!');
      navigate('/student/dashboard');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to sign in';
      toast.error(msg);
    }
  };

  return (
    <AuthLayout
      portal="student"
      title="Student Sign In"
      subtitle="Order from Canteen 1, Canteen 2, Cafe 1, Cafe 2 & Dabeli Stall."
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
          label="Campus Email"
          type="email"
          placeholder="student@campus.com"
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
          variant="accent"
          size="lg"
          fullWidth
          loading={isSubmitting}
          rightIcon={<ArrowRight className="h-4 w-4" />}
        >
          Sign In to Student Portal
        </Button>

        <p className="pt-2 text-center text-sm text-slate-600 dark:text-slate-400">
          New to CampusBite?{' '}
          <Link
            to="/register/student"
            className="font-semibold text-accent-600 hover:text-accent-700 dark:text-accent-400"
          >
            Create a student account
          </Link>
        </p>
      </form>
    </AuthLayout>
  );
}

export default StudentLogin;
