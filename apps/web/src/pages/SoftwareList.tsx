import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  createColumnHelper
} from '@tanstack/react-table';
import { Plus, Search, ChevronLeft, ChevronRight, Filter, X, ArrowUp, ArrowDown } from 'lucide-react';
import { api, Software } from '../lib/api';
import { cn, SOFTWARE_STATUS_LABELS, SOFTWARE_STATUS_COLORS, CRITICALITY_LABELS, CRITICALITY_COLORS, formatDate } from '../lib/utils';

const columnHelper = createColumnHelper<Software>();

const columns = [
  columnHelper.accessor('itemNumber', {
    header: 'Item #',
    cell: (info) => (
      <Link
        to={`/software/${info.row.original.id}`}
        className="text-primary-600 hover:text-primary-800 font-medium"
      >
        {info.getValue()}
      </Link>
    )
  }),
  columnHelper.accessor('name', {
    header: 'Name',
    cell: (info) => info.getValue()
  }),
  columnHelper.accessor('publisher', {
    header: 'Publisher',
    cell: (info) => info.getValue()?.name || '-'
  }),
  columnHelper.accessor('category', {
    header: 'Category',
    cell: (info) => info.getValue()?.name || '-'
  }),
  columnHelper.accessor('version', {
    header: 'Version',
    cell: (info) => info.getValue() || '-'
  }),
  columnHelper.accessor('status', {
    header: 'Status',
    cell: (info) => {
      const status = info.getValue();
      return (
        <span className={cn('px-2 py-1 text-xs font-medium rounded-full', SOFTWARE_STATUS_COLORS[status])}>
          {SOFTWARE_STATUS_LABELS[status] || status}
        </span>
      );
    }
  }),
  columnHelper.accessor('criticalityTier', {
    header: 'Criticality',
    cell: (info) => {
      const tier = info.getValue();
      if (!tier) return '-';
      return (
        <span className={cn('px-2 py-1 text-xs font-medium rounded-full', CRITICALITY_COLORS[tier])}>
          {CRITICALITY_LABELS[tier] || tier}
        </span>
      );
    }
  }),
  columnHelper.accessor('licenseExpiration', {
    header: 'License Expiration',
    cell: (info) => formatDate(info.getValue())
  }),
  columnHelper.accessor('businessOwner', {
    header: 'Business Owner',
    cell: (info) => info.getValue() || '-'
  })
];

export default function SoftwareList() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchInput, setSearchInput] = useState(searchParams.get('search') || '');
  const [showFilters, setShowFilters] = useState(false);

  const page = parseInt(searchParams.get('page') || '1', 10);
  const limit = parseInt(searchParams.get('limit') || '50', 10);
  const search = searchParams.get('search') || '';
  const status = searchParams.get('status') || '_all';
  const category = searchParams.get('category') || '';
  const publisher = searchParams.get('publisher') || '';
  const sortBy = searchParams.get('sortBy') || '';
  const sortOrder = searchParams.get('sortOrder') || '';

  const { data, isLoading, error } = useQuery({
    queryKey: ['software', { page, limit, search, status, category, publisher, sortBy, sortOrder }],
    queryFn: () => api.getSoftwareList({ page, limit, search, status, category, publisher, sortBy, sortOrder })
  });

  const handleSort = (column: string) => {
    const newParams = new URLSearchParams(searchParams);
    if (sortBy === column) {
      if (sortOrder === 'asc') {
        newParams.set('sortOrder', 'desc');
      } else {
        newParams.delete('sortBy');
        newParams.delete('sortOrder');
      }
    } else {
      newParams.set('sortBy', column);
      newParams.set('sortOrder', 'asc');
    }
    newParams.set('page', '1');
    setSearchParams(newParams);
  };

  const { data: categories } = useQuery({
    queryKey: ['softwareCategories'],
    queryFn: api.getSoftwareCategories
  });

  const { data: publishers } = useQuery({
    queryKey: ['softwarePublishers'],
    queryFn: api.getSoftwarePublishers
  });

  const table = useReactTable({
    data: data?.data || [],
    columns,
    getCoreRowModel: getCoreRowModel()
  });

  const updateParams = (updates: Record<string, string | undefined>) => {
    const newParams = new URLSearchParams(searchParams);
    Object.entries(updates).forEach(([key, value]) => {
      if (value) {
        newParams.set(key, value);
      } else {
        newParams.delete(key);
      }
    });
    if (!updates.page) {
      newParams.set('page', '1');
    }
    setSearchParams(newParams);
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    updateParams({ search: searchInput || undefined });
  };

  const clearFilters = () => {
    setSearchInput('');
    setSearchParams({});
  };

  const hasFilters = search || (status && status !== '_all') || category || publisher;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Software</h1>
          <p className="mt-1 text-sm text-gray-500">
            {data?.pagination.total || 0} total software items
          </p>
        </div>
        <div className="flex gap-2">
          <Link to="/software/new" className="btn btn-primary">
            <Plus className="w-4 h-4 mr-2" />
            Add Software
          </Link>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="card p-4 space-y-4">
        <div className="flex flex-col sm:flex-row gap-4">
          {/* Search */}
          <form onSubmit={handleSearch} className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search software..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="input pl-10 pr-4"
              />
            </div>
          </form>

          {/* Filter toggle */}
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={cn('btn', showFilters ? 'btn-primary' : 'btn-secondary')}
          >
            <Filter className="w-4 h-4 mr-2" />
            Filters
            {hasFilters && (
              <span className="ml-2 px-2 py-0.5 text-xs bg-primary-100 text-primary-700 rounded-full">
                Active
              </span>
            )}
          </button>
        </div>

        {/* Expanded filters */}
        {showFilters && (
          <div className="flex flex-wrap gap-4 pt-4 border-t">
            <div className="w-48">
              <label className="label">Status</label>
              <select
                value={status}
                onChange={(e) => updateParams({ status: e.target.value })}
                className="input"
              >
                <option value="_all">All Statuses</option>
                {Object.entries(SOFTWARE_STATUS_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>

            <div className="w-48">
              <label className="label">Category</label>
              <select
                value={category}
                onChange={(e) => updateParams({ category: e.target.value || undefined })}
                className="input"
              >
                <option value="">All Categories</option>
                {categories?.map((cat) => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              </select>
            </div>

            <div className="w-48">
              <label className="label">Publisher</label>
              <select
                value={publisher}
                onChange={(e) => updateParams({ publisher: e.target.value || undefined })}
                className="input"
              >
                <option value="">All Publishers</option>
                {publishers?.map((pub) => (
                  <option key={pub.id} value={pub.id}>{pub.name}</option>
                ))}
              </select>
            </div>

            {hasFilters && (
              <div className="flex items-end">
                <button onClick={clearFilters} className="btn btn-secondary">
                  <X className="w-4 h-4 mr-2" />
                  Clear Filters
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
          </div>
        ) : error ? (
          <div className="p-8 text-center text-red-600">
            Error loading software. Please try again.
          </div>
        ) : data?.data.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            {hasFilters ? 'No software matches your filters.' : 'No software yet. Add your first software item!'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                {table.getHeaderGroups().map((headerGroup) => (
                  <tr key={headerGroup.id}>
                    {headerGroup.headers.map((header) => {
                      const columnId = header.column.id;
                      const isSortable = ['itemNumber', 'name', 'publisher', 'category', 'version', 'status', 'licenseExpiration', 'businessOwner'].includes(columnId);
                      const isSorted = sortBy === columnId;
                      return (
                        <th
                          key={header.id}
                          className={cn(
                            "px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider",
                            isSortable && "cursor-pointer hover:bg-gray-100 select-none"
                          )}
                          onClick={() => isSortable && handleSort(columnId)}
                        >
                          <div className="flex items-center gap-1">
                            {flexRender(header.column.columnDef.header, header.getContext())}
                            {isSortable && (
                              <span className="ml-1">
                                {isSorted ? (
                                  sortOrder === 'asc' ? (
                                    <ArrowUp className="w-3 h-3 text-primary-600" />
                                  ) : (
                                    <ArrowDown className="w-3 h-3 text-primary-600" />
                                  )
                                ) : (
                                  <ArrowUp className="w-3 h-3 text-gray-300" />
                                )}
                              </span>
                            )}
                          </div>
                        </th>
                      );
                    })}
                  </tr>
                ))}
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {table.getRowModel().rows.map((row) => (
                  <tr key={row.id} className="hover:bg-gray-50">
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {data && (
          <div className="flex items-center justify-between px-6 py-3 border-t border-gray-200 bg-gray-50">
            <div className="flex items-center gap-4">
              <div className="text-sm text-gray-500">
                {data.pagination.totalPages > 1
                  ? `Page ${data.pagination.page} of ${data.pagination.totalPages}`
                  : `${data.pagination.total} software items`}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-500">Show:</span>
                <select
                  value={limit}
                  onChange={(e) => updateParams({ limit: e.target.value, page: '1' })}
                  className="input py-1 px-2 text-sm w-20"
                >
                  <option value="50">50</option>
                  <option value="100">100</option>
                  <option value="200">200</option>
                  <option value="500">500</option>
                  <option value="1000">1000</option>
                  <option value="10000">All</option>
                </select>
              </div>
            </div>
            {data.pagination.totalPages > 1 && (
              <div className="flex gap-2">
                <button
                  onClick={() => updateParams({ page: String(page - 1) })}
                  disabled={page <= 1}
                  className="btn btn-secondary"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={() => updateParams({ page: String(page + 1) })}
                  disabled={page >= data.pagination.totalPages}
                  className="btn btn-secondary"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
