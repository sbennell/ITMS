import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { api } from '../lib/api';

export default function StudentDetail() {
  const { id } = useParams<{ id: string }>();

  const { data: student, isLoading, error } = useQuery({
    queryKey: ['student', id],
    queryFn: () => id ? api.getStudent(id) : Promise.reject('No ID'),
    enabled: !!id
  });

  const { data: schoolType } = useQuery({
    queryKey: ['settings', 'schoolType'],
    queryFn: () => api.getSetting('schoolType').catch(() => ({ key: 'schoolType', value: 'STANDARD' }))
  });

  const isDESchool = schoolType?.value === 'DE';

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  if (error || !student) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-red-500">
          Error loading student: {(error as Error)?.message || 'Not found'}
        </div>
      </div>
    );
  }

  const fullName = `${student.firstName} ${student.surname}`;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <Link
            to="/students"
            className="text-primary-600 hover:text-primary-800"
          >
            <ArrowLeft size={24} />
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">{fullName}</h1>
            <p className="mt-1 text-sm text-gray-500">
              {student.status} • Year {student.schoolYear || '-'}
            </p>
          </div>
        </div>
      </div>

      {/* Info Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Personal Information */}
        <div className="bg-white rounded-lg shadow p-6 space-y-4">
          <h2 className="text-lg font-bold text-gray-900 border-b pb-3">Personal Information</h2>
          <DetailRow label="First Name" value={student.firstName} />
          <DetailRow label="Surname" value={student.surname} />
          <DetailRow label="Home Group" value={student.homeGroup || '-'} />
          <DetailRow label="School Year" value={student.schoolYear || '-'} />
          <DetailRow label="Status" value={student.status || 'Active'} />
          <DetailRow
            label="Date of Birth"
            value={
              student.birthdate
                ? new Date(student.birthdate).toLocaleDateString()
                : '-'
            }
          />
        </div>

        {/* Account Details */}
        <div className="bg-white rounded-lg shadow p-6 space-y-4">
          <h2 className="text-lg font-bold text-gray-900 border-b pb-3">Account Details</h2>
          <DetailRow label="Username" value={student.username || '-'} />
          {isDESchool && (
            <DetailRow label="EduPass Username" value={student.edupassUsername || '-'} />
          )}
          <DetailRow label="Email" value={student.email || '-'} />
          <DetailRow label="Password" value={student.password || '-'} />
        </div>
      </div>

      {/* Assigned Assets */}
      {student.assets && student.assets.length > 0 && (
        <div className="bg-white rounded-lg shadow p-6 space-y-4">
          <h2 className="text-lg font-bold text-gray-900 border-b pb-3">Assigned Assets</h2>
          <div className="overflow-x-auto rounded border border-gray-200">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-gray-700">Item #</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-700">Model</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-700">Category</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-700">Status</th>
                </tr>
              </thead>
              <tbody>
                {student.assets.map((asset) => (
                  <tr key={asset.id} className="border-b hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <Link
                        to={`/assets/${asset.id}`}
                        className="text-primary-600 hover:text-primary-800 font-medium"
                      >
                        {asset.itemNumber}
                      </Link>
                    </td>
                    <td className="px-4 py-3">{asset.model || '-'}</td>
                    <td className="px-4 py-3">{asset.category?.name || '-'}</td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-800">
                        {asset.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {(!student.assets || student.assets.length === 0) && (
        <div className="bg-white rounded-lg shadow p-6 text-center text-gray-500">
          No assets assigned to this student
        </div>
      )}
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex justify-between">
      <dt className="text-sm font-medium text-gray-600">{label}</dt>
      <dd className="text-sm text-gray-900 font-medium">{value || '-'}</dd>
    </div>
  );
}
