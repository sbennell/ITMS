import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { ArrowLeft } from 'lucide-react';
import { api, Student } from '../lib/api';

export default function StudentForm() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isEditing = !!id;

  const { data: student, isLoading: studentLoading } = useQuery({
    queryKey: ['student', id],
    queryFn: () => (id ? api.getStudent(id) : Promise.resolve(undefined)),
    enabled: isEditing
  });

  const { data: schoolType } = useQuery({
    queryKey: ['settings', 'schoolType'],
    queryFn: () => api.getSetting('schoolType').catch(() => ({ key: 'schoolType', value: 'STANDARD' }))
  });

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset
  } = useForm<Partial<Student>>({
    defaultValues: student || {
      status: 'Active'
    }
  });

  // Reset form when student data loads
  React.useEffect(() => {
    if (student) {
      reset(student);
    }
  }, [student, reset]);

  const createMutation = useMutation({
    mutationFn: (data: Partial<Student>) => api.createStudent(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['students'] });
      navigate('/students');
    },
    onError: (error) => {
      alert('Error creating student: ' + (error instanceof Error ? error.message : 'Unknown error'));
    }
  });

  const updateMutation = useMutation({
    mutationFn: (data: Partial<Student>) => (id ? api.updateStudent(id, data) : Promise.reject('No ID')),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['student', id] });
      queryClient.invalidateQueries({ queryKey: ['students'] });
      navigate(`/students/${id}`);
    },
    onError: (error) => {
      alert('Error updating student: ' + (error instanceof Error ? error.message : 'Unknown error'));
    }
  });

  const onSubmit = (data: Partial<Student>) => {
    // Convert empty strings to null
    const cleanedData = Object.fromEntries(
      Object.entries(data).map(([k, v]) => [k, v === '' ? null : v])
    );

    if (isEditing) {
      updateMutation.mutate(cleanedData);
    } else {
      createMutation.mutate(cleanedData);
    }
  };

  const isDESchool = schoolType?.value === 'DE';
  const isLoading = studentLoading || (isEditing && !student);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          to={isEditing ? `/students/${id}` : '/students'}
          className="text-primary-600 hover:text-primary-800"
        >
          <ArrowLeft size={24} />
        </Link>
        <h1 className="text-3xl font-bold text-gray-900">
          {isEditing ? 'Edit Student' : 'Add Student'}
        </h1>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Personal Information */}
        <div className="bg-white rounded-lg shadow p-6 space-y-4">
          <h2 className="text-lg font-bold text-gray-900 border-b pb-3">Personal Information</h2>

          <FormField
            label="Preferred Name"
            error={errors.prefName}
            {...register('prefName')}
          />

          <FormField
            label="First Name"
            error={errors.firstName}
            required
            {...register('firstName', { required: 'First name is required' })}
          />

          <FormField
            label="Surname"
            error={errors.surname}
            required
            {...register('surname', { required: 'Surname is required' })}
          />

          <FormField
            label="Home Group"
            error={errors.homeGroup}
            {...register('homeGroup')}
          />

          <FormField
            label="School Year"
            error={errors.schoolYear}
            {...register('schoolYear')}
          />

          <FormField
            label="Status"
            error={errors.status}
            {...register('status')}
          >
            <option value="Active">Active</option>
            <option value="Inactive">Inactive</option>
          </FormField>

          <FormField
            label="Date of Birth"
            type="date"
            error={errors.birthdate}
            {...register('birthdate')}
          />
        </div>

        {/* Account Details */}
        <div className="bg-white rounded-lg shadow p-6 space-y-4">
          <h2 className="text-lg font-bold text-gray-900 border-b pb-3">Account Details</h2>

          <FormField
            label="Username"
            error={errors.username}
            {...register('username')}
          />

          {isDESchool && (
            <FormField
              label="EduPass Username"
              error={errors.edupassUsername}
              {...register('edupassUsername')}
            />
          )}

          <FormField
            label="Email"
            type="email"
            error={errors.email}
            {...register('email')}
          />

          <FormField
            label="Password"
            type="password"
            error={errors.password}
            {...register('password')}
          >
            {isEditing && (
              <p className="text-xs text-gray-500 mt-1">
                Leave blank to keep existing password
              </p>
            )}
          </FormField>
        </div>

        {/* Buttons */}
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={isSubmitting}
            className="btn btn-primary"
          >
            {isSubmitting ? 'Saving...' : isEditing ? 'Update' : 'Create'}
          </button>
          <Link
            to={isEditing ? `/students/${id}` : '/students'}
            className="btn btn-secondary"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}

interface FormFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: any;
  required?: boolean;
  children?: React.ReactNode;
}

const FormField = React.forwardRef<HTMLInputElement, FormFieldProps>(
  ({ label, error, required, children, type = 'text', ...props }, ref) => {
    const isSelect = type === 'select';
    const Component = isSelect ? 'select' : 'input';

    return (
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          {label}
          {required && <span className="text-red-500">*</span>}
        </label>
        {children ? (
          <select
            {...(props as any)}
            ref={ref as any}
            className={`input w-full ${error ? 'border-red-500' : ''}`}
          >
            <option value="">Select {label.toLowerCase()}</option>
            {children}
          </select>
        ) : (
          <input
            type={type}
            ref={ref}
            {...props}
            className={`input w-full ${error ? 'border-red-500' : ''}`}
          />
        )}
        {error && (
          <p className="text-red-500 text-sm mt-1">{error.message}</p>
        )}
      </div>
    );
  }
);

FormField.displayName = 'FormField';

import React from 'react';
