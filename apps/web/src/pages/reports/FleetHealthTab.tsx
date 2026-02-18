import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { api } from '../../lib/api';
import { cn } from '../../lib/utils';

interface FilterState {
  categoryId: string;
  locationId: string;
}

const CONDITION_COLORS: Record<string, string> = {
  NEW: '#10b981',
  EXCELLENT: '#3b82f6',
  GOOD: '#06b6d4',
  FAIR: '#f59e0b',
  POOR: '#ef4444',
  NON_FUNCTIONAL: '#6b7280'
};

const CONDITION_LABELS: Record<string, string> = {
  NEW: 'New',
  EXCELLENT: 'Excellent',
  GOOD: 'Good',
  FAIR: 'Fair',
  POOR: 'Poor',
  NON_FUNCTIONAL: 'Non-Functional'
};

export default function FleetHealthTab() {
  const [filters, setFilters] = useState<FilterState>({ categoryId: '', locationId: '' });
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
    queryKey: ['reports', 'condition', filters, page],
    queryFn: () =>
      api.getConditionReport({
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

  const ConditionBadge = ({ condition }: { condition: string }) => {
    return (
      <span
        className="px-2 py-1 rounded text-xs font-medium text-white"
        style={{ backgroundColor: CONDITION_COLORS[condition] || '#6b7280' }}
      >
        {CONDITION_LABELS[condition] || condition}
      </span>
    );
  };

  if (error) {
    return (
      <div className="text-center py-8">
        <p className="text-red-600">Failed to load fleet health report</p>
      </div>
    );
  }

  // Prepare pie data from summary
  const pieData = data
    ? Object.entries(data.summary)
        .map(([condition, count]) => ({
          name: CONDITION_LABELS[condition] || condition,
          value: count,
          color: CONDITION_COLORS[condition]
        }))
        .filter((x) => x.value > 0)
    : [];

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="card p-4 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
          <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
            {Object.entries(CONDITION_LABELS).map(([key, label]) => (
              <div key={key} className="card p-4 text-center">
                <p className="text-xs text-gray-600 mb-1">{label}</p>
                <p className="text-2xl font-bold" style={{ color: CONDITION_COLORS[key] }}>
                  {data.summary[key as keyof typeof data.summary] || 0}
                </p>
              </div>
            ))}
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Pie Chart */}
            {pieData.length > 0 && (
              <div className="card p-4">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Overall Fleet Health</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, value }) => `${name}: ${value}`}
                      outerRadius={100}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {pieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* By Condition Bar Chart */}
            {data.byCondition.length > 0 && (
              <div className="card p-4">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Assets by Condition</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart
                    data={data.byCondition.map((item) => ({
                      ...item,
                      fill: CONDITION_COLORS[item.condition]
                    }))}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="condition" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="count" fill="#2563eb" shape={<CustomBar />} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* Category Breakdown */}
          {data.byCategory.length > 0 && (
            <div className="card p-4">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Condition by Category</h3>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Category
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        New
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Excellent
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Good
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Fair
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Poor
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Non-Functional
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Total
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {data.byCategory.map((row, idx) => (
                      <tr key={idx} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          {row.category}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{row.NEW}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{row.EXCELLENT}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{row.GOOD}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{row.FAIR}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{row.POOR}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{row.NON_FUNCTIONAL}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          {row.total}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
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
                      Category
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Location
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Condition
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
                        {asset.category?.name || '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {asset.location?.name || '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <ConditionBadge condition={asset.condition} />
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{asset.status}</td>
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

// Custom bar to use color from data
function CustomBar(props: any) {
  const { fill, x, y, width, height } = props;
  return <rect x={x} y={y} width={width} height={height} fill={fill} />;
}
