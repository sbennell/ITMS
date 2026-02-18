import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { AlertCircle, CheckCircle2, XCircle } from 'lucide-react';
import { api } from '../../lib/api';
import { cn } from '../../lib/utils';

interface FilterState {
  days: string;
  categoryId: string;
  locationId: string;
}

export default function WarrantyTab() {
  const [filters, setFilters] = useState<FilterState>({ days: '90', categoryId: '', locationId: '' });
  const [page, setPage] = useState(1);
  const pageSize = 50;

  const { data: categoriesData } = useQuery({
    queryKey: ['lookups', 'categories'],
    queryFn: api.getCategories
  });

  const { data: locationsData } = useQuery({
    queryKey: ['lookups', 'locations'],
    queryFn: api.getLocations
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ['reports', 'warranty', filters, page],
    queryFn: () =>
      api.getWarrantyReport({
        days: filters.days,
        category: filters.categoryId,
        location: filters.locationId,
        skip: (page - 1) * pageSize,
        limit: pageSize
      })
  });

  const handleFilterChange = (key: keyof FilterState, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setPage(1);
  };

  const StatusBadge = ({ status }: { status: string }) => {
    const statusConfig: Record<
      string,
      { bg: string; text: string; icon: React.ReactNode }
    > = {
      ok: {
        bg: 'bg-green-100',
        text: 'text-green-700',
        icon: <CheckCircle2 className="w-4 h-4" />
      },
      expiring_soon: {
        bg: 'bg-amber-100',
        text: 'text-amber-700',
        icon: <AlertCircle className="w-4 h-4" />
      },
      expired: {
        bg: 'bg-red-100',
        text: 'text-red-700',
        icon: <XCircle className="w-4 h-4" />
      },
      no_warranty: {
        bg: 'bg-gray-100',
        text: 'text-gray-700',
        icon: <AlertCircle className="w-4 h-4" />
      }
    };

    const config = statusConfig[status] || statusConfig.ok;
    const label =
      status === 'expiring_soon'
        ? 'Expiring Soon'
        : status === 'no_warranty'
          ? 'No Warranty'
          : status.charAt(0).toUpperCase() + status.slice(1);

    return (
      <div className={cn('inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium', config.bg, config.text)}>
        {config.icon}
        {label}
      </div>
    );
  };

  if (error) {
    return (
      <div className="text-center py-8">
        <p className="text-red-600">Failed to load warranty report</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="card p-4 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="label">Days Until Expiry</label>
            <input
              type="number"
              value={filters.days}
              onChange={(e) => handleFilterChange('days', e.target.value)}
              className="input"
              min="0"
            />
          </div>
          <div>
            <label className="label">Category</label>
            <select
              value={filters.categoryId}
              onChange={(e) => handleFilterChange('categoryId', e.target.value)}
              className="input"
            >
              <option value="">All Categories</option>
              {categoriesData?.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Location</label>
            <select
              value={filters.locationId}
              onChange={(e) => handleFilterChange('locationId', e.target.value)}
              className="input"
            >
              <option value="">All Locations</option>
              {locationsData?.map((loc) => (
                <option key={loc.id} value={loc.id}>
                  {loc.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
        </div>
      ) : data ? (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="card p-4">
              <p className="text-sm text-gray-600">No Warranty</p>
              <p className="text-2xl font-bold text-gray-900">{data.summary.noWarranty}</p>
            </div>
            <div className="card p-4">
              <p className="text-sm text-gray-600">Expired</p>
              <p className="text-2xl font-bold text-red-600">{data.summary.expired}</p>
            </div>
            <div className="card p-4">
              <p className="text-sm text-gray-600">Expiring Soon</p>
              <p className="text-2xl font-bold text-amber-600">{data.summary.expiringSoon}</p>
            </div>
            <div className="card p-4">
              <p className="text-sm text-gray-600">OK</p>
              <p className="text-2xl font-bold text-green-600">{data.summary.ok}</p>
            </div>
          </div>

          {/* Chart */}
          {data.byMonth.length > 0 && (
            <div className="card p-4">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Warranty Expiration Timeline</h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={data.byMonth}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="count" fill="#2563eb" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Assets Table */}
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Item Number
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Model
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Manufacturer
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Category
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Warranty Expiry
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Days Until
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {data.assets.map((asset) => (
                    <tr key={asset.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-primary-600">
                        <a href={`/assets/${asset.id}`} className="hover:text-primary-700">
                          {asset.itemNumber}
                        </a>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{asset.model || '-'}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {asset.manufacturer?.name || '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {asset.category?.name || '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {asset.warrantyExpiration
                          ? new Date(asset.warrantyExpiration).toLocaleDateString()
                          : '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {asset.daysUntilExpiry !== null ? asset.daysUntilExpiry : '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <StatusBadge status={asset.warrantyStatus} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between px-6 py-3 border-t border-gray-200 bg-gray-50">
              <div className="text-sm text-gray-600">
                Showing {(page - 1) * pageSize + 1} to {Math.min(page * pageSize, data.pagination.total)} of{' '}
                {data.pagination.total}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage(Math.max(1, page - 1))}
                  disabled={page === 1}
                  className="btn btn-secondary disabled:opacity-50"
                >
                  Previous
                </button>
                <div className="flex items-center gap-2">
                  {Array.from({ length: data.pagination.totalPages }, (_, i) => i + 1)
                    .slice(Math.max(0, page - 3), Math.min(data.pagination.totalPages, page + 2))
                    .map((p) => (
                      <button
                        key={p}
                        onClick={() => setPage(p)}
                        className={cn(
                          'px-3 py-1 rounded text-sm',
                          page === p
                            ? 'bg-primary-600 text-white'
                            : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'
                        )}
                      >
                        {p}
                      </button>
                    ))}
                </div>
                <button
                  onClick={() => setPage(Math.min(data.pagination.totalPages, page + 1))}
                  disabled={page === data.pagination.totalPages}
                  className="btn btn-secondary disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
