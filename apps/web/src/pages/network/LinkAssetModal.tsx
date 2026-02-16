import { useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { api } from '../../lib/api';

interface LinkAssetModalProps {
  ip: string;
  subnetId: string;
  onClose: () => void;
}

export default function LinkAssetModal({ ip, subnetId, onClose }: LinkAssetModalProps) {
  const [search, setSearch] = useState('');
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const queryClient = useQueryClient();

  // Debounce search
  const [debouncedSearch, setDebouncedSearch] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);

    return () => clearTimeout(timer);
  }, [search]);

  const { data: searchResults, isLoading } = useQuery({
    queryKey: ['assets-search', debouncedSearch],
    queryFn: () => api.getAssets({ search: debouncedSearch, limit: 20 }),
    enabled: debouncedSearch.length > 0
  });

  const updateMutation = useMutation({
    mutationFn: () => {
      if (!selectedAssetId) throw new Error('No asset selected');
      return api.updateAsset(selectedAssetId, { ipAddress: ip });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subnet-ips', subnetId] });
      onClose();
    },
    onError: (err: Error) => {
      setError(err.message);
    }
  });

  const handleConfirm = () => {
    if (!selectedAssetId) {
      setError('Please select an asset');
      return;
    }
    updateMutation.mutate();
  };

  const selectedAsset = selectedAssetId
    ? searchResults?.data.find((a) => a.id === selectedAssetId)
    : null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-lg w-full max-w-md p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">Link Asset to IP</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="text-sm text-gray-600">
          <p>
            Link asset to IP: <span className="font-mono font-semibold text-gray-900">{ip}</span>
          </p>
        </div>

        {error && (
          <div className="p-3 bg-red-50 text-red-700 text-sm rounded-md">
            {error}
            <button onClick={() => setError('')} className="ml-2 underline">
              Dismiss
            </button>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Search for asset
          </label>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Item number, hostname, model..."
            className="input w-full"
            autoFocus
          />
        </div>

        {/* Search Results */}
        {search && (
          <div className="border border-gray-200 rounded-md max-h-64 overflow-y-auto">
            {isLoading ? (
              <div className="p-3 text-center text-gray-500">Searching...</div>
            ) : searchResults && searchResults.data.length > 0 ? (
              <div className="divide-y divide-gray-100">
                {searchResults.data.map((asset) => (
                  <button
                    key={asset.id}
                    onClick={() => setSelectedAssetId(asset.id)}
                    className={`w-full text-left p-3 hover:bg-gray-50 transition-colors ${
                      selectedAssetId === asset.id ? 'bg-blue-50' : ''
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <input
                        type="radio"
                        checked={selectedAssetId === asset.id}
                        onChange={() => setSelectedAssetId(asset.id)}
                        className="mt-0.5"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-900 text-sm">
                          {asset.itemNumber} {asset.model ? `- ${asset.model}` : ''}
                        </p>
                        {asset.ipAddress && (
                          <p className="text-xs text-orange-600">
                            Current IP: {asset.ipAddress}
                          </p>
                        )}
                        {asset.hostname && (
                          <p className="text-xs text-gray-500">{asset.hostname}</p>
                        )}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="p-3 text-center text-gray-500 text-sm">No assets found</div>
            )}
          </div>
        )}

        {/* Selected Asset Summary */}
        {selectedAsset && (
          <div className="p-3 bg-blue-50 rounded-md border border-blue-200">
            <p className="text-sm font-medium text-blue-900">
              Selected: {selectedAsset.itemNumber}
            </p>
            {selectedAsset.ipAddress && (
              <p className="text-xs text-orange-600 mt-1">
                ⚠ This asset currently has IP: {selectedAsset.ipAddress}
              </p>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3 justify-end pt-4 border-t border-gray-200">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!selectedAssetId || updateMutation.isPending}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {updateMutation.isPending ? 'Linking...' : 'Link Asset'}
          </button>
        </div>
      </div>
    </div>
  );
}
