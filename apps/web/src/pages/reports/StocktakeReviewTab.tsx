import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useReactTable, getCoreRowModel, createColumnHelper, getSortedRowModel, SortingState } from '@tanstack/react-table';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Package, CheckCircle2, AlertCircle, HelpCircle, X, ExternalLink, ChevronUp, ChevronDown, ChevronsUpDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api, ReviewAssetRow } from '../../lib/api';
import { formatDate, STATUS_COLORS } from '../../lib/utils';

const REVIEW_STATUS_COLORS = {
  reviewed: 'bg-green-100 text-green-800',
  overdue: 'bg-orange-100 text-orange-800',
  never: 'bg-red-100 text-red-800'
};

const REVIEW_STATUS_LABELS = {
  reviewed: 'Reviewed',
  overdue: 'Overdue',
  never: 'Never Reviewed'
};

export default function StocktakeReviewTab() {
  const [yearFilter, setYearFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [locationFilter, setLocationFilter] = useState('');
  const [overdueMonths, setOverdueMonths] = useState('12');
  const [sorting, setSorting] = useState<SortingState>([]);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);

  const { data, isLoading, error } = useQuery({
    queryKey: ['stocktake-review-report', { yearFilter, statusFilter, categoryFilter, locationFilter, overdueMonths }],
    queryFn: () =>
      api.getStocktakeReviewReport({
        year: yearFilter || undefined,
        status: statusFilter || undefined,
        category: categoryFilter || undefined,
        location: locationFilter || undefined,
        overdueMonths: overdueMonths !== '12' ? overdueMonths : undefined
      })
  });

  const { data: categories } = useQuery({ queryKey: ['categories'], queryFn: api.getCategories });
  const { data: locations } = useQuery({ queryKey: ['locations'], queryFn: api.getLocations });

  const clearFilters = () => {
    setYearFilter('');
    setStatusFilter('');
    setCategoryFilter('');
    setLocationFilter('');
    setOverdueMonths('12');
    setPage(1);
  };

  const columnHelper = createColumnHelper<ReviewAssetRow>();
  const columns = [
    columnHelper.accessor('itemNumber', {
      header: 'Item #',
      cell: (info: any) => (
        <Link to={`/assets/${info.row.original.id}`} className="text-primary-600 hover:text-primary-700 underline flex items-center gap-1">
          {info.getValue()}
          <ExternalLink className="w-3 h-3" />
        </Link>
      )
    }),
    columnHelper.accessor('model', { header: 'Model', cell: (info: any) => info.getValue() || '-' }),
    columnHelper.accessor('serialNumber', { header: 'Serial #', cell: (info: any) => info.getValue() || '-' }),
    columnHelper.accessor('category', {
      header: 'Category',
      cell: (info: any) => info.getValue()?.name || '-',
      sortingFn: (a, b) => (a.original.category?.name ?? '').localeCompare(b.original.category?.name ?? '')
    }),
    columnHelper.accessor('location', {
      header: 'Location',
      cell: (info: any) => info.getValue()?.name || '-',
      sortingFn: (a, b) => (a.original.location?.name ?? '').localeCompare(b.original.location?.name ?? '')
    }),
    columnHelper.accessor('status', {
      header: 'Status',
      cell: (info: any) => (
        <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${STATUS_COLORS[info.getValue() as keyof typeof STATUS_COLORS] || 'bg-gray-100 text-gray-800'}`}>
          {info.getValue()}
        </span>
      )
    }),
    columnHelper.accessor('lastReviewDate', { header: 'Last Review Date', cell: (info: any) => (info.getValue() ? formatDate(info.getValue()) : '-') }),
    columnHelper.accessor('reviewStatus', {
      header: 'Review Status',
      cell: (info: any) => {
        const status = info.getValue() as 'reviewed' | 'overdue' | 'never';
        return (
          <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${REVIEW_STATUS_COLORS[status]}`}>
            {REVIEW_STATUS_LABELS[status]}
          </span>
        );
      }
    }),
    columnHelper.accessor('daysSinceReview', { header: 'Days Since Review', cell: (info: any) => (info.getValue() !== null ? info.getValue() : '-') })
  ] as any;

  const allAssets = data?.assets || [];
  const totalPages = Math.ceil(allAssets.length / limit);
  const paginatedAssets = allAssets.slice((page - 1) * limit, page * limit);

  const table = useReactTable({
    data: paginatedAssets,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    state: { sorting },
    onSortingChange: setSorting
  });

  if (isLoading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div></div>;
  if (error) return <div className="card p-8 text-center text-red-600 flex flex-col items-center gap-2"><AlertCircle className="w-8 h-8" /><p>Failed to load report data.</p></div>;
  if (!data) return null;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card p-4 flex items-center gap-4"><div className="bg-gray-100 rounded-lg p-3"><Package className="w-6 h-6 text-gray-600" /></div><div><p className="text-sm text-gray-600">Total Assets</p><p className="text-2xl font-bold text-gray-900">{data.summary.totalAssets}</p></div></div>
        <div className="card p-4 flex items-center gap-4"><div className="bg-green-100 rounded-lg p-3"><CheckCircle2 className="w-6 h-6 text-green-600" /></div><div><p className="text-sm text-gray-600">Reviewed This Year</p><p className="text-2xl font-bold text-green-600">{data.summary.reviewedThisYear}</p></div></div>
        <div className="card p-4 flex items-center gap-4"><div className="bg-orange-100 rounded-lg p-3"><AlertCircle className="w-6 h-6 text-orange-600" /></div><div><p className="text-sm text-gray-600">Overdue</p><p className="text-2xl font-bold text-orange-600">{data.summary.overdueCount}</p></div></div>
        <div className="card p-4 flex items-center gap-4"><div className="bg-red-100 rounded-lg p-3"><HelpCircle className="w-6 h-6 text-red-600" /></div><div><p className="text-sm text-gray-600">Never Reviewed</p><p className="text-2xl font-bold text-red-600">{data.summary.neverReviewedCount}</p></div></div>
      </div>

      <div className="card p-4">
        <h2 className="text-sm font-medium text-gray-700 mb-4">Reviews by Year</h2>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={data.byYear}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="year" tick={{ fontSize: 12 }} />
            <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
            <Tooltip formatter={(value: any) => [value, 'Assets Reviewed']} contentStyle={{ fontSize: 12 }} />
            <Bar dataKey="count" fill="#2563eb" radius={[4, 4, 0, 0]} onClick={(entry: any) => setYearFilter(String(entry.payload.year))} style={{ cursor: 'pointer' }} />
          </BarChart>
        </ResponsiveContainer>
        {yearFilter && <p className="text-xs text-gray-500 mt-2">Filtered to {yearFilter}. <button onClick={() => setYearFilter('')} className="text-primary-600 hover:underline">Clear</button></p>}
      </div>

      <div className="flex flex-wrap gap-3 items-center">
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="input text-sm h-9">
          <option value="">All Statuses</option>
          <option value="reviewed">Reviewed</option>
          <option value="overdue">Overdue</option>
          <option value="never">Never Reviewed</option>
        </select>
        <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="input text-sm h-9">
          <option value="">All Categories</option>
          {categories?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select value={locationFilter} onChange={(e) => setLocationFilter(e.target.value)} className="input text-sm h-9">
          <option value="">All Locations</option>
          {locations?.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <span>Overdue after</span>
          <input type="number" min="1" max="60" value={overdueMonths} onChange={(e) => setOverdueMonths(e.target.value)} className="input text-sm h-9 w-16" />
          <span>months</span>
        </div>
        {(yearFilter || statusFilter || categoryFilter || locationFilter || overdueMonths !== '12') && (
          <button onClick={clearFilters} className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1"><X className="w-3 h-3" /> Clear filters</button>
        )}
      </div>

      <div className="card overflow-hidden">
        <div className="p-4 border-b border-gray-200 flex items-center justify-between">
          <p className="text-sm text-gray-600">{data.assets.length} assets shown</p>
          {totalPages > 1 && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500">Show:</span>
              <select
                value={limit}
                onChange={(e) => { setLimit(Number(e.target.value)); setPage(1); }}
                className="input text-sm h-9 w-16"
              >
                <option value="10">10</option>
                <option value="25">25</option>
                <option value="50">50</option>
                <option value="100">100</option>
              </select>
            </div>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <th
                      key={header.id}
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                      onClick={header.column.getCanSort() ? header.column.getToggleSortingHandler() : undefined}
                      style={header.column.getCanSort() ? { cursor: 'pointer', userSelect: 'none' } : undefined}
                    >
                      {header.isPlaceholder ? null : (
                        <span className="inline-flex items-center gap-1">
                          {typeof header.column.columnDef.header === 'string'
                            ? header.column.columnDef.header
                            : typeof header.column.columnDef.header === 'function'
                            ? (header.column.columnDef.header as any)(header.getContext())
                            : null}
                          {header.column.getCanSort() && (
                            header.column.getIsSorted() === 'asc' ? <ChevronUp className="w-3 h-3" /> :
                            header.column.getIsSorted() === 'desc' ? <ChevronDown className="w-3 h-3" /> :
                            <ChevronsUpDown className="w-3 h-3 opacity-40" />
                          )}
                        </span>
                      )}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {table.getRowModel().rows.map((row) => (
                <tr key={row.id} className="hover:bg-gray-50">
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-6 py-4 whitespace-nowrap text-sm">
                      {typeof cell.column.columnDef.cell === 'function' ? (cell.column.columnDef.cell as any)(cell.getContext()) : cell.getValue()}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {data.assets.length === 0 && <div className="p-8 text-center text-gray-500"><p>No assets match the selected filters.</p></div>}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-6 py-3 border-t border-gray-200 bg-gray-50">
            <div className="text-sm text-gray-500">
              Page {page} of {totalPages}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setPage(page - 1)}
                disabled={page <= 1}
                className="btn btn-secondary"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => setPage(page + 1)}
                disabled={page >= totalPages}
                className="btn btn-secondary"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
