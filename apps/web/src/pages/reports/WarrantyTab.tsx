import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useReactTable, getCoreRowModel, createColumnHelper, getSortedRowModel, SortingState } from '@tanstack/react-table';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Calendar, AlertTriangle, CheckCircle, HelpCircle, X, ExternalLink, ChevronUp, ChevronDown, ChevronsUpDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api, WarrantyAssetRow } from '../../lib/api';
import { formatDate, STATUS_COLORS } from '../../lib/utils';

const WARRANTY_STATUS_COLORS = {
  no_warranty: 'bg-gray-100 text-gray-800',
  expired: 'bg-red-100 text-red-800',
  expiring_soon: 'bg-orange-100 text-orange-800',
  ok: 'bg-green-100 text-green-800'
};

const WARRANTY_STATUS_LABELS = {
  no_warranty: 'No Warranty',
  expired: 'Expired',
  expiring_soon: 'Expiring Soon',
  ok: 'OK'
};

export default function WarrantyTab() {
  const [daysFilter, setDaysFilter] = useState('90');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [locationFilter, setLocationFilter] = useState('');
  const [sorting, setSorting] = useState<SortingState>([]);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);

  const { data, isLoading, error } = useQuery({
    queryKey: ['warranty-report', { daysFilter, categoryFilter, locationFilter }],
    queryFn: () =>
      api.getWarrantyReport({
        days: daysFilter || undefined,
        category: categoryFilter || undefined,
        location: locationFilter || undefined
      })
  });

  const { data: categories } = useQuery({ queryKey: ['categories'], queryFn: api.getCategories });
  const { data: locations } = useQuery({ queryKey: ['locations'], queryFn: api.getLocations });

  const clearFilters = () => {
    setDaysFilter('90');
    setCategoryFilter('');
    setLocationFilter('');
    setPage(1);
  };

  const columnHelper = createColumnHelper<WarrantyAssetRow>();
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
    columnHelper.accessor('category', {
      header: 'Category',
      cell: (info: any) => info.getValue()?.name || '-',
      sortingFn: (a, b) => (a.original.category?.name ?? '').localeCompare(b.original.category?.name ?? '')
    }),
    columnHelper.accessor('manufacturer', {
      header: 'Manufacturer',
      cell: (info: any) => info.getValue()?.name || '-',
      sortingFn: (a, b) => (a.original.manufacturer?.name ?? '').localeCompare(b.original.manufacturer?.name ?? '')
    }),
    columnHelper.accessor('status', {
      header: 'Status',
      cell: (info: any) => (
        <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${STATUS_COLORS[info.getValue() as keyof typeof STATUS_COLORS] || 'bg-gray-100 text-gray-800'}`}>
          {info.getValue()}
        </span>
      )
    }),
    columnHelper.accessor('warrantyExpiration', { header: 'Warranty Expiration', cell: (info: any) => (info.getValue() ? formatDate(info.getValue()) : '-') }),
    columnHelper.accessor('daysUntilExpiry', { header: 'Days Until Expiry', cell: (info: any) => (info.getValue() !== null ? info.getValue() : '-') }),
    columnHelper.accessor('warrantyStatus', {
      header: 'Warranty Status',
      cell: (info: any) => {
        const status = info.getValue() as 'no_warranty' | 'expired' | 'expiring_soon' | 'ok';
        return (
          <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${WARRANTY_STATUS_COLORS[status]}`}>
            {WARRANTY_STATUS_LABELS[status]}
          </span>
        );
      }
    })
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
  if (error) return <div className="card p-8 text-center text-red-600 flex flex-col items-center gap-2"><AlertTriangle className="w-8 h-8" /><p>Failed to load report data.</p></div>;
  if (!data) return null;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card p-4 flex items-center gap-4"><div className="bg-gray-100 rounded-lg p-3"><HelpCircle className="w-6 h-6 text-gray-600" /></div><div><p className="text-sm text-gray-600">No Warranty</p><p className="text-2xl font-bold text-gray-900">{data.summary.noWarranty}</p></div></div>
        <div className="card p-4 flex items-center gap-4"><div className="bg-red-100 rounded-lg p-3"><AlertTriangle className="w-6 h-6 text-red-600" /></div><div><p className="text-sm text-gray-600">Expired</p><p className="text-2xl font-bold text-red-600">{data.summary.expired}</p></div></div>
        <div className="card p-4 flex items-center gap-4"><div className="bg-orange-100 rounded-lg p-3"><Calendar className="w-6 h-6 text-orange-600" /></div><div><p className="text-sm text-gray-600">Expiring Soon</p><p className="text-2xl font-bold text-orange-600">{data.summary.expiringSoon}</p></div></div>
        <div className="card p-4 flex items-center gap-4"><div className="bg-green-100 rounded-lg p-3"><CheckCircle className="w-6 h-6 text-green-600" /></div><div><p className="text-sm text-gray-600">OK</p><p className="text-2xl font-bold text-green-600">{data.summary.ok}</p></div></div>
      </div>

      <div className="card p-4">
        <h2 className="text-sm font-medium text-gray-700 mb-4">Warranty Expirations by Month</h2>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={data.byMonth}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="month" tick={{ fontSize: 12 }} />
            <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
            <Tooltip contentStyle={{ fontSize: 12 }} />
            <Line type="monotone" dataKey="count" stroke="#2563eb" strokeWidth={2} dot={{ fill: '#2563eb', r: 4 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="flex flex-wrap gap-3 items-center">
        <select value={daysFilter} onChange={(e) => setDaysFilter(e.target.value)} className="input text-sm h-9">
          <option value="30">Within 30 days</option>
          <option value="60">Within 60 days</option>
          <option value="90">Within 90 days</option>
          <option value="180">Within 180 days</option>
          <option value="365">Within 1 year</option>
        </select>
        <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="input text-sm h-9">
          <option value="">All Categories</option>
          {categories?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select value={locationFilter} onChange={(e) => setLocationFilter(e.target.value)} className="input text-sm h-9">
          <option value="">All Locations</option>
          {locations?.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
        {(daysFilter !== '90' || categoryFilter || locationFilter) && (
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
