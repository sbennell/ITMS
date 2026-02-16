import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import LinkAssetModal from './LinkAssetModal';

interface SubnetIPTableProps {
  subnetId: string;
  subnet: { id: string; name: string; cidr: string };
}

export default function SubnetIPTable({ subnetId }: SubnetIPTableProps) {
  const [selectedIpForLink, setSelectedIpForLink] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['subnet-ips', subnetId],
    queryFn: () => api.getSubnetIPs(subnetId)
  });

  if (isLoading) {
    return <div className="text-center text-gray-500">Loading IP addresses...</div>;
  }

  if (!data || data.ips.length === 0) {
    return <div className="text-center text-gray-500">No IPs found in this subnet</div>;
  }

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="text-left py-3 px-4 font-semibold text-gray-700">IP Address</th>
              <th className="text-left py-3 px-4 font-semibold text-gray-700">Hostname</th>
              <th className="text-left py-3 px-4 font-semibold text-gray-700">Status</th>
              <th className="text-left py-3 px-4 font-semibold text-gray-700">Asset</th>
              <th className="text-right py-3 px-4 font-semibold text-gray-700">Actions</th>
            </tr>
          </thead>
          <tbody>
            {data.ips.map((ipData) => (
              <tr key={ipData.ip} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="py-3 px-4 font-mono text-gray-900">{ipData.ip}</td>
                <td className="py-3 px-4 font-mono text-gray-500">
                  {ipData.asset?.hostname || <span className="text-gray-300">—</span>}
                </td>
                <td className="py-3 px-4">
                  {ipData.asset ? (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                      Linked
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                      Free
                    </span>
                  )}
                </td>
                <td className="py-3 px-4">
                  {ipData.asset ? (
                    <Link
                      to={`/assets/${ipData.asset.id}`}
                      className="text-blue-600 hover:text-blue-700 font-medium"
                    >
                      {ipData.asset.itemNumber}
                    </Link>
                  ) : (
                    <span className="text-gray-400 text-xs">—</span>
                  )}
                </td>
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
            ))}
          </tbody>
        </table>
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
