import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  createColumnHelper,
  type VisibilityState
} from '@tanstack/react-table';
import { Plus, Search, ChevronLeft, ChevronRight, Filter, Columns3, X, ArrowUp, ArrowDown, Printer, Copy, Pencil } from 'lucide-react';
import { api, Asset } from '../lib/api';
import { cn, formatDate, formatCurrency, STATUS_LABELS, STATUS_COLORS, CRITICALITY_LABELS, CRITICALITY_COLORS } from '../lib/utils';
import BatchPrintModal from '../components/BatchPrintModal';
import BulkEditModal from '../components/BulkEditModal';

const columnHelper = createColumnHelper<Asset>();

const columns = [
  columnHelper.accessor('itemNumber', {
    header: 'Item #',
    size: 120,
    enableHiding: false,
    cell: (info) => (
      <Link
        to={`/assets/${info.row.original.id}`}
        className="text-primary-600 hover:text-primary-800 font-medium"
      >
        {info.getValue()}
      </Link>
    )
  }),
  columnHelper.accessor('manufacturer', {
    header: 'Manufacturer',
    size: 140,
    enableHiding: false,
    cell: (info) => info.getValue()?.name || '-'
  }),
  columnHelper.accessor('model', {
    header: 'Model',
    size: 140,
    enableHiding: false,
    cell: (info) => info.getValue() || '-'
  }),
  columnHelper.accessor('serialNumber', {
    header: 'Serial Number',
    size: 160,
    enableHiding: false,
    cell: (info) => info.getValue() || '-'
  }),
  columnHelper.accessor('category', {
    header: 'Category',
    size: 130,
    cell: (info) => info.getValue()?.name || '-'
  }),
  columnHelper.accessor('status', {
    header: 'Status',
    size: 150,
    cell: (info) => {
      const status = info.getValue();
      return (
        <span className={cn('px-2 py-1 text-xs font-medium rounded-full', STATUS_COLORS[status])}>
          {STATUS_LABELS[status] || status}
        </span>
      );
    }
  }),
  columnHelper.accessor('criticalityTier', {
    header: 'Criticality',
    size: 120,
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
  columnHelper.accessor('assignedTo', {
    header: 'Assigned To',
    size: 180,
    cell: (info) => {
      const asset = info.row.original;
      if (asset.student) {
        return (
          <Link
            to={`/students/${asset.student.id}`}
            className="text-primary-600 hover:text-primary-800 font-medium"
          >
            {asset.student.prefName || asset.student.firstName} {asset.student.surname}
          </Link>
        );
      }
      return info.getValue() || '-';
    }
  }),
  columnHelper.accessor('location', {
    header: 'Location',
    size: 140,
    cell: (info) => info.getValue()?.name || '-'
  }),
  columnHelper.accessor('hostname', {
    header: 'Hostname',
    size: 140,
    cell: (info) => info.getValue() || '-'
  }),
  columnHelper.accessor('ipAddresses', {
    header: 'IP Addresses',
    size: 160,
    cell: (info) => {
      const ips = info.getValue();
      if (!ips || ips.length === 0) return '-';
      return ips.map((e) => (e.label ? `${e.ip} (${e.label})` : e.ip)).join(', ');
    }
  }),
  columnHelper.accessor('warrantyExpiration', {
    header: 'Warranty Expiration',
    size: 150,
    cell: (info) => formatDate(info.getValue())
  }),
  columnHelper.accessor('endOfLifeDate', {
    header: 'End of Life Date',
    size: 140,
    cell: (info) => formatDate(info.getValue())
  }),
  columnHelper.accessor('lastReviewDate', {
    header: 'Last Review Date',
    size: 140,
    cell: (info) => formatDate(info.getValue())
  }),
  columnHelper.accessor('acquiredDate', {
    header: 'Acquired Date',
    size: 130,
    cell: (info) => formatDate(info.getValue())
  }),
  columnHelper.accessor('purchasePrice', {
    header: 'Purchase Price',
    size: 120,
    cell: (info) => formatCurrency(info.getValue())
  }),
  columnHelper.accessor('supplier', {
    header: 'Supplier',
    size: 140,
    cell: (info) => info.getValue()?.name || '-'
  }),
  columnHelper.accessor('orderNumber', {
    header: 'Order Number',
    size: 130,
    cell: (info) => info.getValue() || '-'
  })
];

// Header text and a plain-text accessor for each column, used to auto-fit column
// widths to their content on first load - kept separate from the cell renderers
// above since those return JSX (badges, links) rather than measurable text.
const COLUMN_META: { id: string; header: string; getText: (asset: Asset) => string }[] = [
  { id: 'itemNumber', header: 'Item #', getText: (a) => a.itemNumber || '' },
  { id: 'manufacturer', header: 'Manufacturer', getText: (a) => a.manufacturer?.name || '' },
  { id: 'model', header: 'Model', getText: (a) => a.model || '' },
  { id: 'serialNumber', header: 'Serial Number', getText: (a) => a.serialNumber || '' },
  { id: 'category', header: 'Category', getText: (a) => a.category?.name || '' },
  { id: 'status', header: 'Status', getText: (a) => STATUS_LABELS[a.status] || a.status || '' },
  {
    id: 'criticalityTier',
    header: 'Criticality',
    getText: (a) => (a.criticalityTier ? CRITICALITY_LABELS[a.criticalityTier] || a.criticalityTier : '')
  },
  {
    id: 'assignedTo',
    header: 'Assigned To',
    getText: (a) => (a.student ? `${a.student.prefName || a.student.firstName} ${a.student.surname}` : a.assignedTo || '')
  },
  { id: 'location', header: 'Location', getText: (a) => a.location?.name || '' },
  { id: 'hostname', header: 'Hostname', getText: (a) => a.hostname || '' },
  {
    id: 'ipAddresses',
    header: 'IP Addresses',
    getText: (a) => (a.ipAddresses?.length ? a.ipAddresses.map((e) => (e.label ? `${e.ip} (${e.label})` : e.ip)).join(', ') : '')
  },
  { id: 'warrantyExpiration', header: 'Warranty Expiration', getText: (a) => (a.warrantyExpiration ? formatDate(a.warrantyExpiration) : '') },
  { id: 'endOfLifeDate', header: 'End of Life Date', getText: (a) => (a.endOfLifeDate ? formatDate(a.endOfLifeDate) : '') },
  { id: 'lastReviewDate', header: 'Last Review Date', getText: (a) => (a.lastReviewDate ? formatDate(a.lastReviewDate) : '') },
  { id: 'acquiredDate', header: 'Acquired Date', getText: (a) => (a.acquiredDate ? formatDate(a.acquiredDate) : '') },
  { id: 'purchasePrice', header: 'Purchase Price', getText: (a) => (a.purchasePrice ? formatCurrency(a.purchasePrice) : '') },
  { id: 'supplier', header: 'Supplier', getText: (a) => a.supplier?.name || '' },
  { id: 'orderNumber', header: 'Order Number', getText: (a) => a.orderNumber || '' }
];

const LOCKED_COLUMN_IDS = ['itemNumber', 'manufacturer', 'model', 'serialNumber'];
const TOGGLEABLE_COLUMN_META = COLUMN_META.filter(({ id }) => !LOCKED_COLUMN_IDS.includes(id));

// New columns are opt-in: hidden until the user turns them on via the Columns picker.
const DEFAULT_HIDDEN_COLUMN_IDS = [
  'hostname', 'ipAddresses', 'warrantyExpiration', 'endOfLifeDate',
  'lastReviewDate', 'acquiredDate', 'purchasePrice', 'supplier', 'orderNumber'
];

const COLUMN_VISIBILITY_STORAGE_KEY = 'assets.columnVisibility';

// Loads saved column visibility, seeding new columns to hidden by default so they
// don't suddenly clutter the table for existing users until explicitly turned on.
function loadColumnVisibility(): VisibilityState {
  const defaults: VisibilityState = {};
  for (const id of DEFAULT_HIDDEN_COLUMN_IDS) defaults[id] = false;
  try {
    const raw = localStorage.getItem(COLUMN_VISIBILITY_STORAGE_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return defaults;
    const result: VisibilityState = { ...defaults };
    for (const { id } of TOGGLEABLE_COLUMN_META) {
      if (id in parsed) result[id] = Boolean((parsed as Record<string, unknown>)[id]);
    }
    return result;
  } catch {
    return defaults;
  }
}

const AUTO_SIZE_MIN = 60;
const AUTO_SIZE_MAX = 400;
const CELL_FONT = '400 14px ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const HEADER_FONT = '500 12px ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const CELL_PADDING = 48; // px-6 left + right
const HEADER_EXTRA = 88; // px-6 header padding (48) + sort arrow icon/gap (24) + safety margin (16)
// Header text renders uppercase with tracking-wider letter-spacing (~0.025em), which
// canvas measureText doesn't emulate - approximate it as extra px per character.
const HEADER_LETTER_SPACING_PER_CHAR = 0.6;
const BADGE_PADDING = 20; // status/criticality render as rounded pill badges

let measureCanvas: HTMLCanvasElement | null = null;
function measureTextWidth(text: string, font: string): number {
  if (!text) return 0;
  if (!measureCanvas) measureCanvas = document.createElement('canvas');
  const ctx = measureCanvas.getContext('2d');
  if (!ctx) return text.length * 7;
  ctx.font = font;
  return ctx.measureText(text).width;
}

const COLUMN_SIZING_STORAGE_KEY = 'assets.columnSizing';

// Loads saved column widths (from a previous manual resize or auto-fit), or null
// if nothing valid is saved yet - callers use null to mean "run auto-fit instead".
function loadColumnSizing(): Record<string, number> | null {
  try {
    const raw = localStorage.getItem(COLUMN_SIZING_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const result: Record<string, number> = {};
    for (const { id } of COLUMN_META) {
      const value = (parsed as Record<string, unknown>)[id];
      if (typeof value === 'number' && Number.isFinite(value)) result[id] = value;
    }
    return Object.keys(result).length > 0 ? result : null;
  } catch {
    return null;
  }
}

// Auto-fit each column to the widest content it holds (header or any cell in the
// current page of data), so long values are visible without manual resizing on
// first load. Clamped to a sane range - after this, resizing is fully manual.
function computeAutoColumnSizing(assets: Asset[]): Record<string, number> {
  const sizing: Record<string, number> = {};
  for (const { id, header, getText } of COLUMN_META) {
    let maxWidth = measureTextWidth(header, HEADER_FONT) + header.length * HEADER_LETTER_SPACING_PER_CHAR + HEADER_EXTRA;
    for (const asset of assets) {
      const text = getText(asset);
      if (!text) continue;
      let width = measureTextWidth(text, CELL_FONT) + CELL_PADDING;
      if (id === 'status' || id === 'criticalityTier') width += BADGE_PADDING;
      if (width > maxWidth) maxWidth = width;
    }
    sizing[id] = Math.round(Math.max(AUTO_SIZE_MIN, Math.min(AUTO_SIZE_MAX, maxWidth)));
  }
  return sizing;
}

export default function AssetList() {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchInput, setSearchInput] = useState(searchParams.get('search') || '');
  const [showFilters, setShowFilters] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBatchPrintModal, setShowBatchPrintModal] = useState(false);
  const [showBulkEditModal, setShowBulkEditModal] = useState(false);
  const [columnSizing, setColumnSizing] = useState<Record<string, number>>({});
  const hasAutoSizedColumns = useRef(false);
  const [showColumnPicker, setShowColumnPicker] = useState(false);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(loadColumnVisibility);
  const columnPickerRef = useRef<HTMLDivElement>(null);

  const page = parseInt(searchParams.get('page') || '1', 10);
  const limit = parseInt(searchParams.get('limit') || '50', 10);
  const search = searchParams.get('search') || '';
  const status = searchParams.get('status') ?? '_active';
  const category = searchParams.get('category') || '';
  const manufacturer = searchParams.get('manufacturer') || '';
  const location = searchParams.get('location') || '';
  const stocktakeStatus = searchParams.get('stocktakeStatus') || '';
  const sortBy = searchParams.get('sortBy') || '';
  const sortOrder = searchParams.get('sortOrder') || '';

  const { data, isLoading, error } = useQuery({
    queryKey: ['assets', { page, limit, search, status, category, manufacturer, location, stocktakeStatus, sortBy, sortOrder }],
    queryFn: () => api.getAssets({ page, limit, search, status, category, manufacturer, location, stocktakeStatus, sortBy, sortOrder })
  });

  const handleSort = (column: string) => {
    const newParams = new URLSearchParams(searchParams);
    if (sortBy === column) {
      // Toggle order or clear if already desc
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
    queryKey: ['categories'],
    queryFn: api.getCategories
  });

  const { data: manufacturers } = useQuery({
    queryKey: ['manufacturers'],
    queryFn: api.getManufacturers
  });

  const { data: locations } = useQuery({
    queryKey: ['locations'],
    queryFn: api.getLocations
  });

  useLayoutEffect(() => {
    const saved = loadColumnSizing();
    if (saved) {
      setColumnSizing(saved);
      hasAutoSizedColumns.current = true;
    }
  }, []);

  useLayoutEffect(() => {
    if (!hasAutoSizedColumns.current && data?.data && data.data.length > 0) {
      setColumnSizing(computeAutoColumnSizing(data.data));
      hasAutoSizedColumns.current = true;
    }
  }, [data]);

  useEffect(() => {
    if (!hasAutoSizedColumns.current) return;
    try {
      localStorage.setItem(COLUMN_SIZING_STORAGE_KEY, JSON.stringify(columnSizing));
    } catch {
      // localStorage unavailable/full - sizing just won't persist this session
    }
  }, [columnSizing]);

  useEffect(() => {
    try {
      localStorage.setItem(COLUMN_VISIBILITY_STORAGE_KEY, JSON.stringify(columnVisibility));
    } catch {
      // localStorage unavailable/full - visibility just won't persist this session
    }
  }, [columnVisibility]);

  useEffect(() => {
    if (!showColumnPicker) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (columnPickerRef.current && !columnPickerRef.current.contains(e.target as Node)) {
        setShowColumnPicker(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowColumnPicker(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [showColumnPicker]);

  const table = useReactTable({
    data: data?.data || [],
    columns,
    getCoreRowModel: getCoreRowModel(),
    columnResizeMode: 'onChange',
    enableColumnResizing: true,
    state: { columnSizing, columnVisibility },
    onColumnSizingChange: setColumnSizing,
    onColumnVisibilityChange: setColumnVisibility,
    defaultColumn: {
      minSize: 60
    }
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
    // Reset to page 1 when filters change
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

  const hasFilters = search || (status && status !== '_active' && status !== '_all') || category || manufacturer || location || stocktakeStatus;

  const toggleSelectAll = () => {
    if (!data?.data) return;
    const allIds = data.data.map(a => a.id);
    const allSelected = allIds.every(id => selectedIds.has(id));
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(allIds));
    }
  };

  const toggleSelect = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedIds(newSet);
  };

  const handleBatchPrint = () => {
    if (selectedIds.size === 0) return;
    setShowBatchPrintModal(true);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Hardware Assets</h1>
          <p className="mt-1 text-sm text-gray-500">
            {data?.pagination.total || 0} total assets
            {selectedIds.size > 0 && ` (${selectedIds.size} selected)`}
          </p>
        </div>
        <div className="flex gap-2">
          {selectedIds.size > 0 && (
            <>
              <button
                onClick={() => setShowBulkEditModal(true)}
                className="btn btn-secondary"
              >
                <Pencil className="w-4 h-4 mr-2" />
                Edit Selected ({selectedIds.size})
              </button>
              <button
                onClick={handleBatchPrint}
                className="btn btn-secondary"
              >
                <Printer className="w-4 h-4 mr-2" />
                Print Labels ({selectedIds.size})
              </button>
            </>
          )}
          <Link to="/assets/bulk-add" className="btn btn-secondary">
            <Copy className="w-4 h-4 mr-2" />
            Bulk Add
          </Link>
          <Link to="/assets/new" className="btn btn-primary">
            <Plus className="w-4 h-4 mr-2" />
            Add Asset
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
                placeholder="Search assets..."
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

          {/* Column visibility toggle */}
          <div className="relative" ref={columnPickerRef}>
            <button
              onClick={() => setShowColumnPicker(!showColumnPicker)}
              className={cn('btn', showColumnPicker ? 'btn-primary' : 'btn-secondary')}
            >
              <Columns3 className="w-4 h-4 mr-2" />
              Columns
            </button>

            {showColumnPicker && (
              <div className="absolute top-full right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-10 w-56 py-2 max-h-80 overflow-y-auto">
                {TOGGLEABLE_COLUMN_META.map(({ id, header }) => (
                  <label
                    key={id}
                    className="flex items-center gap-2 px-4 py-1.5 text-sm text-gray-700 hover:bg-gray-50 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={columnVisibility[id] ?? true}
                      onChange={() => setColumnVisibility((old) => ({ ...old, [id]: !(old[id] ?? true) }))}
                      className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                    />
                    {header}
                  </label>
                ))}
              </div>
            )}
          </div>
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
                <option value="_active">Active</option>
                <option value="_all">All Statuses</option>
                {Object.entries(STATUS_LABELS).map(([value, label]) => (
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
              <label className="label">Manufacturer</label>
              <select
                value={manufacturer}
                onChange={(e) => updateParams({ manufacturer: e.target.value || undefined })}
                className="input"
              >
                <option value="">All Manufacturers</option>
                {manufacturers?.map((mfr) => (
                  <option key={mfr.id} value={mfr.id}>{mfr.name}</option>
                ))}
              </select>
            </div>

            <div className="w-48">
              <label className="label">Location</label>
              <select
                value={location}
                onChange={(e) => updateParams({ location: e.target.value || undefined })}
                className="input"
              >
                <option value="">All Locations</option>
                {locations?.map((loc) => (
                  <option key={loc.id} value={loc.id}>{loc.name}</option>
                ))}
              </select>
            </div>

            <div className="w-48">
              <label className="label">Last Stocktake</label>
              <select
                value={stocktakeStatus}
                onChange={(e) => updateParams({ stocktakeStatus: e.target.value || undefined })}
                className="input"
              >
                <option value="">All</option>
                <option value="reviewed">Reviewed</option>
                <option value="overdue">Overdue</option>
                <option value="never">Never Reviewed</option>
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
            Error loading assets. Please try again.
          </div>
        ) : data?.data.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            {hasFilters ? 'No assets match your filters.' : 'No assets yet. Add your first asset!'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table
              className="divide-y divide-gray-200"
              style={{ width: table.getTotalSize() + 40, tableLayout: 'fixed' }}
            >
              <thead className="bg-gray-50">
                {table.getHeaderGroups().map((headerGroup) => (
                  <tr key={headerGroup.id}>
                    <th className="px-4 py-3 w-10">
                      <input
                        type="checkbox"
                        checked={data?.data.length ? data.data.every(a => selectedIds.has(a.id)) : false}
                        onChange={toggleSelectAll}
                        className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                      />
                    </th>
                    {headerGroup.headers.map((header) => {
                      const columnId = header.column.id;
                      const isSortable = ['itemNumber', 'manufacturer', 'model', 'category', 'status', 'assignedTo', 'location', 'hostname'].includes(columnId);
                      const isSorted = sortBy === columnId;
                      return (
                        <th
                          key={header.id}
                          style={{ width: header.getSize() }}
                          className={cn(
                            "relative px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider",
                            isSortable && "cursor-pointer hover:bg-gray-100 select-none"
                          )}
                          onClick={() => isSortable && handleSort(columnId)}
                        >
                          <div className="flex items-center gap-1 overflow-hidden">
                            <span className="truncate">
                              {flexRender(header.column.columnDef.header, header.getContext())}
                            </span>
                            {isSortable && (
                              <span className="ml-1 flex-shrink-0">
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
                          {header.column.getCanResize() && (
                            <div
                              onMouseDown={header.getResizeHandler()}
                              onTouchStart={header.getResizeHandler()}
                              onClick={(e) => e.stopPropagation()}
                              className={cn(
                                'absolute top-0 right-0 h-full w-2 cursor-col-resize select-none touch-none',
                                header.column.getIsResizing() ? 'bg-primary-500' : 'hover:bg-gray-300'
                              )}
                            />
                          )}
                        </th>
                      );
                    })}
                  </tr>
                ))}
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {table.getRowModel().rows.map((row) => (
                  <tr key={row.id} className={cn("hover:bg-gray-50", selectedIds.has(row.original.id) && "bg-primary-50")}>
                    <td className="px-4 py-4 w-10">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(row.original.id)}
                        onChange={() => toggleSelect(row.original.id)}
                        className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                      />
                    </td>
                    {row.getVisibleCells().map((cell) => (
                      <td
                        key={cell.id}
                        style={{ width: cell.column.getSize() }}
                        className="px-6 py-4 overflow-hidden text-ellipsis whitespace-nowrap text-sm text-gray-900"
                      >
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
                  : `${data.pagination.total} assets`}
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

      {/* Batch Print Modal */}
      {showBatchPrintModal && (
        <BatchPrintModal
          assetIds={Array.from(selectedIds)}
          onClose={() => setShowBatchPrintModal(false)}
          onSuccess={() => setSelectedIds(new Set())}
        />
      )}

      {/* Bulk Edit Modal */}
      {showBulkEditModal && (
        <BulkEditModal
          assetIds={Array.from(selectedIds)}
          onClose={() => setShowBulkEditModal(false)}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['assets'] });
            setSelectedIds(new Set());
          }}
        />
      )}
    </div>
  );
}
