import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Mail, Lock, User, Hash, Building2, ArrowRight } from 'lucide-react';
import toast from 'react-hot-toast';
import { AuthLayout } from '@/layouts/AuthLayout';
import { Button, Input, Select } from '@/components/ui';
import api from '@/lib/axios';

const registerSchema = z
  .object({
    firstName: z.string().min(1, 'First name is required').max(100),
    lastName: z.string().min(1, 'Last name is required').max(100),
    email: z.string().email('Enter a valid campus email'),
    enrollmentNo: z.string().min(2, 'Enrollment number is required').max(50),
    department: z.string().min(2, 'Department is required').max(100),
    year: z.enum(['1', '2', '3', '4']),
    dietaryType: z.enum(['VEG', 'NON_VEG', 'VEGAN', 'EGG']),
    password: z
      .string()
      .min(8, 'At least 8 characters')
      .regex(
        /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&#])/,
        'Include uppercase, lowercase, number, and special character (@$!%*?&#)'
      ),
    confirmPassword: z.string().min(1, 'Please confirm your password'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

type RegisterForm = z.infer<typeof registerSchema>;

export function StudentRegister() {
  const navigate = useNavigate();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      firstName: '',
      lastName: '',
      email: '',
      enrollmentNo: '',
      department: 'Computer Engineering',
      year: '3',
      dietaryType: 'VEG',
      password: '',
      confirmPassword: '',
    },
  });

  const onSubmit = async (values: RegisterForm) => {
    try {
      await api.post('/auth/student/register', {
        firstName: values.firstName,
        lastName: values.lastName,
        email: values.email,
        password: values.password,
        enrollmentNo: values.enrollmentNo,
        department: values.department,
        year: Number(values.year),
        dietaryType: values.dietaryType,
      });
      toast.success('Account created! Please sign in.');
      navigate('/login/student');
    } catch (error: unknown) {
      const err = error as { response?: { data?: { error?: string; message?: string } } };
      const msg =
        err.response?.data?.error ||
        err.response?.data?.message ||
        'Registration failed. Please verify your details.';
      toast.error(msg);
    }
  };

  return (
    <AuthLayout
      portal="student"
      title="Create Student Account"
      subtitle="Set up your campus dining profile & dietary preferences."
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-3.5" noValidate>
        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
          <Input
            label="First Name"
            placeholder="Aarav"
            icon={<User className="h-4 w-4" />}
            error={errors.firstName?.message}
            {...register('firstName')}
          />
          <Input
            label="Last Name"
            placeholder="Sharma"
            icon={<User className="h-4 w-4" />}
            error={errors.lastName?.message}
            {...register('lastName')}
          />
        </div>

        <Input
          label="Campus Email"
          type="email"
          placeholder="aarav.sharma@campus.com"
          icon={<Mail className="h-4 w-4" />}
          error={errors.email?.message}
          {...register('email')}
        />

        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
          <Input
            label="Enrollment No."
            placeholder="EN2024001"
            icon={<Hash className="h-4 w-4" />}
            error={errors.enrollmentNo?.message}
            {...register('enrollmentNo')}
          />
          <Input
            label="Department"
            placeholder="Computer Engineering"
            icon={<Building2 className="h-4 w-4" />}
            error={errors.department?.message}
            {...register('department')}
          />
        </div>

        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
          <Select
            label="Academic Year"
            error={errors.year?.message}
            options={[
              { value: '1', label: 'First Year (FE)' },
              { value: '2', label: 'Second Year (SE)' },
              { value: '3', label: 'Third Year (TE)' },
              { value: '4', label: 'Final Year (BE)' },
            ]}
            {...register('year')}
          />
          <Select
            label="Dietary Preference"
            error={errors.dietaryType?.message}
            options={[
              { value: 'VEG', label: 'Vegetarian' },
              { value: 'NON_VEG', label: 'Non-Vegetarian' },
              { value: 'VEGAN', label: 'Vegan' },
              { value: 'EGG', label: 'Eggetarian' },
            ]}
            {...register('dietaryType')}
          />
        </div>

        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
          <Input
            label="Password"
            type="password"
            placeholder="••••••••"
            icon={<Lock className="h-4 w-4" />}
            error={errors.password?.message}
            {...register('password')}
          />
          <Input
            label="Confirm Password"
            type="password"
            placeholder="••••••••"
            icon={<Lock className="h-4 w-4" />}
            error={errors.confirmPassword?.message}
            {...register('confirmPassword')}
          />
        </div>

        <Button
          type="submit"
          variant="accent"
          size="lg"
          fullWidth
          loading={isSubmitting}
          rightIcon={<ArrowRight className="h-4 w-4" />}
        >
          Register Student Account
        </Button>

        <p className="pt-1 text-center text-sm text-slate-600 dark:text-slate-400">
          Already registered?{' '}
          <Link
            to="/login/student"
            className="font-semibold text-accent-600 hover:text-accent-700 dark:text-accent-400"
          >
            Sign in here
          </Link>
        </p>
      </form>
    </AuthLayout>
  );
}

export default StudentRegister;
