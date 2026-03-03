import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  createColumnHelper
} from '@tanstack/react-table';
import { Search, ChevronLeft, ChevronRight, Filter, X } from 'lucide-react';
import { api, Student } from '../lib/api';

const columnHelper = createColumnHelper<Student>();

const columns = [
  columnHelper.accessor('firstName', {
    header: 'First Name',
    cell: (info) => (
      <Link
        to={`/students/${info.row.original.id}`}
        className="text-primary-600 hover:text-primary-800 font-medium"
      >
        {info.getValue() || '-'}
      </Link>
    )
  }),
  columnHelper.accessor('surname', {
    header: 'Surname',
    cell: (info) => info.getValue() || '-'
  }),
  columnHelper.accessor('homeGroup', {
    header: 'Home Group',
    cell: (info) => info.getValue() || '-'
  }),
  columnHelper.accessor('schoolYear', {
    header: 'Year Level',
    cell: (info) => info.getValue() || '-'
  }),
  columnHelper.accessor('status', {
    header: 'Status',
    cell: (info) => (
      <span className="px-2 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-800">
        {info.getValue() || 'Active'}
      </span>
    )
  }),
  columnHelper.accessor('email', {
    header: 'Email',
    cell: (info) => info.getValue() || '-'
  })
];

export default function StudentList() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchInput, setSearchInput] = useState(searchParams.get('search') || '');
  const [showFilters, setShowFilters] = useState(false);

  const page = parseInt(searchParams.get('page') || '1', 10);
  const limit = parseInt(searchParams.get('limit') || '50', 10);
  const search = searchParams.get('search') || '';
  const status = searchParams.get('status') || '';
  const schoolYear = searchParams.get('schoolYear') || '';
  const homeGroup = searchParams.get('homeGroup') || '';
  const sortBy = searchParams.get('sortBy') || 'firstName';
  const sortOrder = searchParams.get('sortOrder') || 'asc';

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

  // Debounced search as you type
  useEffect(() => {
    const timer = setTimeout(() => {
      updateParams({ search: searchInput || undefined });
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput, updateParams]);

  const { data, isLoading, error } = useQuery({
    queryKey: ['students', { page, limit, search, status, schoolYear, homeGroup, sortBy, sortOrder }],
    queryFn: () => api.getStudents({ page, limit, search, status, schoolYear, homeGroup, sortBy, sortOrder })
  });

  const { data: statuses = [] } = useQuery({
    queryKey: ['studentStatuses'],
    queryFn: api.getStudentStatuses
  });

  const { data: yearLevels = [] } = useQuery({
    queryKey: ['studentYearLevels'],
    queryFn: api.getStudentYearLevels
  });

  const { data: homeGroups = [] } = useQuery({
    queryKey: ['studentHomeGroups'],
    queryFn: api.getStudentHomeGroups
  });

  const table = useReactTable({
    data: data?.data || [],
    columns,
    getCoreRowModel: getCoreRowModel()
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    updateParams({ search: searchInput || undefined });
  };

  const clearFilters = () => {
    setSearchInput('');
    setSearchParams({});
  };

  const hasFilters = search || status || schoolYear || homeGroup;

  const handlePageChange = (direction: 'prev' | 'next') => {
    const newPage = direction === 'next' ? page + 1 : Math.max(1, page - 1);
    updateParams({ page: String(newPage) });
  };

  const handleLimitChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    updateParams({ limit: e.target.value, page: '1' });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Students</h1>
          <p className="mt-1 text-sm text-gray-500">
            {data?.pagination.total || 0} total students
            <span className="block text-xs text-gray-400 mt-1">Students are added via CSV import only (Settings {'>'} Students)</span>
          </p>
        </div>
      </div>

      {/* Search Bar */}
      <form onSubmit={handleSearch} className="flex gap-2">
        <div className="flex-1 relative">
          <input
            type="text"
            placeholder="Search by name, email, username..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="input w-full"
          />
        </div>
        <button type="submit" className="btn btn-secondary">
          <Search size={18} />
        </button>
        <button
          type="button"
          onClick={() => setShowFilters(!showFilters)}
          className={`btn ${showFilters ? 'btn-primary' : 'btn-secondary'}`}
        >
          <Filter size={18} />
        </button>
        {hasFilters && (
          <button
            type="button"
            onClick={clearFilters}
            className="btn btn-secondary"
          >
            <X size={18} />
            Clear
          </button>
        )}
      </form>

      {/* Filters */}
      {showFilters && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 p-4 bg-gray-50 rounded-lg">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Status
            </label>
            <select
              value={status}
              onChange={(e) => updateParams({ status: e.target.value || undefined })}
              className="input text-sm"
            >
              <option value="">All Statuses</option>
              {statuses.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Year Level
            </label>
            <select
              value={schoolYear}
              onChange={(e) => updateParams({ schoolYear: e.target.value || undefined })}
              className="input text-sm"
            >
              <option value="">All Years</option>
              {yearLevels.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Home Group
            </label>
            <select
              value={homeGroup}
              onChange={(e) => updateParams({ homeGroup: e.target.value || undefined })}
              className="input text-sm"
            >
              <option value="">All Home Groups</option>
              {homeGroups.map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th key={header.id} className="px-4 py-3 text-left font-medium text-gray-700">
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-8 text-center text-gray-500">
                  Loading...
                </td>
              </tr>
            ) : error ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-8 text-center text-red-500">
                  Error loading students: {(error as Error).message}
                </td>
              </tr>
            ) : data?.data?.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-8 text-center text-gray-500">
                  No students found
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row) => (
                <tr key={row.id} className="border-b border-gray-200 hover:bg-gray-50">
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-4 py-3 text-gray-900">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {data && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-gray-600">
            Showing page {page} of {data.pagination.totalPages}
          </div>
          <div className="flex gap-2 items-center">
            <label className="text-sm text-gray-600">Per page:</label>
            <select
              value={limit}
              onChange={handleLimitChange}
              className="input text-sm w-20"
            >
              <option value="10">10</option>
              <option value="25">25</option>
              <option value="50">50</option>
              <option value="100">100</option>
            </select>
            <button
              onClick={() => handlePageChange('prev')}
              disabled={page === 1}
              className="btn btn-secondary disabled:opacity-50"
            >
              <ChevronLeft size={18} />
            </button>
            <button
              onClick={() => handlePageChange('next')}
              disabled={page >= data.pagination.totalPages}
              className="btn btn-secondary disabled:opacity-50"
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
