import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useReactTable, getCoreRowModel, createColumnHelper, getSortedRowModel, SortingState } from '@tanstack/react-table';
import { ChevronUp, ChevronDown, ChevronsUpDown, ChevronLeft, ChevronRight, ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import LinkAssetModal from './LinkAssetModal';

interface SubnetIPTableProps {
  subnetId: string;
  subnet: { id: string; name: string; cidr: string };
}

export default function SubnetIPTable({ subnetId }: SubnetIPTableProps) {
  const [selectedIpForLink, setSelectedIpForLink] = useState<string | null>(null);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);

  // Reset sorting, page, and limit when subnet changes
  useEffect(() => {
    setSorting([]);
    setPage(1);
    setLimit(50);
  }, [subnetId]);

  const { data, isLoading } = useQuery({
    queryKey: ['subnet-ips', subnetId],
    queryFn: () => api.getSubnetIPs(subnetId)
  });

  // Create columns outside of conditionals to maintain hook order
  const columnHelper = createColumnHelper<any>();
  const columns = [
    columnHelper.accessor('ip', { header: 'IP Address' }),
    columnHelper.accessor((row: any) => row.asset?.hostname || '-', { header: 'Hostname', id: 'hostname' }),
    columnHelper.accessor((row: any) => row.asset ? 'Linked' : 'Free', { header: 'Status', id: 'status' }),
    columnHelper.accessor((row: any) => row.asset?.itemNumber || '-', { header: 'Asset', id: 'asset' })
  ] as any;

  const allIps = data?.ips || [];

  const table = useReactTable({
    data: allIps,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    state: { sorting },
    onSortingChange: (updater) => {
      setSorting(updater);
      setPage(1);
    }
  });

  const allSortedRows = table.getRowModel().rows;
  const totalPages = Math.ceil(allSortedRows.length / limit);
  const displayRows = allSortedRows.slice((page - 1) * limit, page * limit);

  if (isLoading) {
    return <div className="text-center text-gray-500">Loading IP addresses...</div>;
  }

  if (!data || data.ips.length === 0) {
    return <div className="text-center text-gray-500">No IPs found in this subnet</div>;
  }

  return (
    <>
      <div className="space-y-4">
        {totalPages > 1 && (
          <div className="flex items-center justify-end gap-2">
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

        <div className="overflow-x-auto">
          <table className="w-full text-sm divide-y divide-gray-200">
            <thead className="bg-gray-50">
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id} className="border-b border-gray-200">
                  {headerGroup.headers.map((header) => (
                    <th
                      key={header.id}
                      className="text-left py-3 px-4 font-semibold text-gray-700"
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
                  <th className="text-right py-3 px-4 font-semibold text-gray-700">Actions</th>
                </tr>
              ))}
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              {displayRows.map((row) => {
                const ipData = row.original;
                return (
                  <tr key={ipData.ip} className="hover:bg-gray-50">
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className="py-3 px-4 font-mono text-gray-500">
                        {cell.id.endsWith('ip') ? (
                          <span className="text-gray-900">{cell.getValue() as any}</span>
                        ) : cell.id.endsWith('asset') ? (
                          ipData.asset ? (
                            <Link
                              to={`/assets/${ipData.asset.id}`}
                              className="text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
                            >
                              {cell.getValue() as any}
                              <ExternalLink className="w-3 h-3" />
                            </Link>
                          ) : (
                            <span>-</span>
                          )
                        ) : (
                          <span>{cell.getValue() as any}</span>
                        )}
                      </td>
                    ))}
                    <td className="py-3 px-4 text-right">
                      {!ipData.asset ? (
                        <div className="flex gap-2 justify-end">
                          <button
                            onClick={() => setSelectedIpForLink(ipData.ip)}
                            className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                          >
                            Link
                          </button>
                          <a
                            href={`/assets/new?ip=${encodeURIComponent(ipData.ip)}`}
                            className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                          >
                            Create
                          </a>
                        </div>
                      ) : (
                        <span className="text-gray-400 text-xs">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 bg-gray-50 rounded border border-gray-200">
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

      {selectedIpForLink && (
        <LinkAssetModal
          ip={selectedIpForLink}
          subnetId={subnetId}
          onClose={() => setSelectedIpForLink(null)}
        />
      )}
    </>
  );
}
