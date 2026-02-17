import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { api } from '../../lib/api';

function SubnetManager() {
  const [newName, setNewName] = useState('');
  const [newCidr, setNewCidr] = useState('');
  const [error, setError] = useState('');
  const queryClient = useQueryClient();

  const { data: subnets, isLoading } = useQuery({
    queryKey: ['subnets'],
    queryFn: api.getSubnets
  });

  const createMutation = useMutation({
    mutationFn: (data: { name: string; cidr: string }) => api.createSubnet(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subnets'] });
      setNewName('');
      setNewCidr('');
      setError('');
    },
    onError: (err: Error) => {
      setError(err.message);
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteSubnet(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subnets'] });
    },
    onError: (err: Error) => {
      setError(err.message);
    }
  });

  const validateCidr = (cidr: string): boolean => {
    const cidrRegex = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\/(\d{1,2})$/;
    if (!cidrRegex.test(cidr)) return false;

    const parts = cidr.split('/');
    const prefix = parseInt(parts[1]);
    if (prefix < 20 || prefix > 32) return false;

    return true;
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) {
      setError('Subnet name is required');
      return;
    }
    if (!newCidr.trim()) {
      setError('CIDR is required');
      return;
    }
    if (!validateCidr(newCidr.trim())) {
      setError('Invalid CIDR format. Use format like 192.168.1.0/24 (prefix must be /20-/32)');
      return;
    }
    createMutation.mutate({ name: newName.trim(), cidr: newCidr.trim() });
  };

  const handleDelete = (id: string, name: string) => {
    if (window.confirm(`Delete subnet "${name}"?`)) {
      deleteMutation.mutate(id);
    }
  };

  return (
    <div className="card p-6">
      <h2 className="text-lg font-semibold mb-4">Network Subnets</h2>

      {error && (
        <div className="mb-4 p-3 bg-red-50 text-red-700 text-sm rounded-md">
          {error}
          <button onClick={() => setError('')} className="ml-2 underline">
            Dismiss
          </button>
        </div>
      )}

      {/* Add form */}
      <form onSubmit={handleCreate} className="space-y-3 mb-4">
        <div className="flex gap-2">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Subnet name..."
            className="input flex-1"
          />
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={newCidr}
            onChange={(e) => setNewCidr(e.target.value)}
            placeholder="CIDR (e.g., 192.168.1.0/24)..."
            className="input flex-1"
          />
          <button
            type="submit"
            disabled={!newName.trim() || !newCidr.trim() || createMutation.isPending}
            className="btn btn-primary"
          >
            <Plus className="w-4 h-4" />
            Add
          </button>
        </div>
      </form>

      {/* List */}
      {isLoading ? (
        <div className="text-center text-gray-500">Loading...</div>
      ) : subnets && subnets.length > 0 ? (
        <div className="space-y-2">
          {subnets.map((subnet) => (
            <div
              key={subnet.id}
              className="flex items-center justify-between p-3 bg-gray-50 rounded-md"
            >
              <div>
                <p className="font-medium text-gray-900">{subnet.name}</p>
                <p className="text-xs text-gray-500">{subnet.cidr}</p>
              </div>
              <button
                onClick={() => handleDelete(subnet.id, subnet.name)}
                disabled={deleteMutation.isPending}
                className="text-red-600 hover:text-red-700"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-gray-500">No subnets configured yet</p>
      )}
    </div>
  );
}

export default function NetworkingTab() {
  return <SubnetManager />;
}
