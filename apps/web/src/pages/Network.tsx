import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import SubnetIPTable from './network/SubnetIPTable';

export default function Network() {
  const [activeTabId, setActiveTabId] = useState<string | null>(null);

  const { data: subnets, isLoading } = useQuery({
    queryKey: ['subnets'],
    queryFn: api.getSubnets
  });

  // Set active tab to first subnet on load
  if (subnets && subnets.length > 0 && !activeTabId) {
    setActiveTabId(subnets[0].id);
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-gray-500">Loading subnets...</div>
      </div>
    );
  }

  if (!subnets || subnets.length === 0) {
    return (
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">IP Addresses</h1>
          <p className="mt-1 text-sm text-gray-500">
            View and manage IP addresses within configured subnets
          </p>
        </div>

        <div className="card p-8 text-center">
          <p className="text-gray-600">
            No subnets configured. Go to{' '}
            <a href="/settings" className="text-blue-600 hover:text-blue-700 font-medium">
              Settings
            </a>{' '}
            to add network subnets.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">IP Addresses</h1>
        <p className="mt-1 text-sm text-gray-500">
          View and manage IP addresses within configured subnets
        </p>
      </div>

      {/* Tab Navigation */}
      <div className="card">
        <div className="flex border-b border-gray-200 px-6">
          {subnets.map((subnet) => (
            <button
              key={subnet.id}
              onClick={() => setActiveTabId(subnet.id)}
              className={`py-3 px-4 font-medium text-sm border-b-2 transition-colors ${
                activeTabId === subnet.id
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              {subnet.name}
              <span className="text-xs text-gray-500 ml-1">({subnet.cidr})</span>
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="p-6">
          {activeTabId && (
            <SubnetIPTable subnetId={activeTabId} subnet={subnets.find(s => s.id === activeTabId)!} />
          )}
        </div>
      </div>
    </div>
  );
}
