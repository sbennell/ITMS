import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { api, Lookup } from '../../lib/api';

function LookupManager({
  title,
  queryKey,
  fetchFn,
  createFn,
  deleteFn
}: {
  title: string;
  queryKey: string;
  fetchFn: () => Promise<Lookup[]>;
  createFn: (data: { name: string }) => Promise<Lookup>;
  deleteFn: (id: string) => Promise<{ success: boolean }>;
}) {
  const [newName, setNewName] = useState('');
  const [error, setError] = useState('');
  const queryClient = useQueryClient();

  const { data: items, isLoading } = useQuery({
    queryKey: [queryKey],
    queryFn: fetchFn
  });

  const createMutation = useMutation({
    mutationFn: createFn,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [queryKey] });
      setNewName('');
      setError('');
    },
    onError: (err: Error) => {
      setError(err.message);
    }
  });

  const deleteMutation = useMutation({
    mutationFn: deleteFn,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [queryKey] });
    },
    onError: (err: Error) => {
      setError(err.message);
    }
  });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (newName.trim()) {
      createMutation.mutate({ name: newName.trim() });
    }
  };

  const handleDelete = (id: string, name: string, count?: number) => {
    if (count && count > 0) {
      setError(`Cannot delete "${name}" - it has ${count} asset${count !== 1 ? 's' : ''}`);
      return;
    }
    if (window.confirm(`Delete "${name}"?`)) {
      deleteMutation.mutate(id);
    }
  };

  return (
    <div className="card p-6">
      <h2 className="text-lg font-semibold mb-4">{title}</h2>

      {error && (
        <div className="mb-4 p-3 bg-red-50 text-red-700 text-sm rounded-md">
          {error}
          <button onClick={() => setError('')} className="ml-2 underline">
            Dismiss
          </button>
        </div>
      )}

      {/* Add form */}
      <form onSubmit={handleCreate} className="flex gap-2 mb-4">
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder={`New ${title.toLowerCase().slice(0, -1)}...`}
          className="input flex-1"
        />
        <button
          type="submit"
          disabled={!newName.trim() || createMutation.isPending}
          className="btn btn-primary"
        >
          <Plus className="w-4 h-4" />
        </button>
      </form>

      {/* List */}
      {isLoading ? (
        <div className="text-center py-4">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600 mx-auto"></div>
        </div>
      ) : items?.length === 0 ? (
        <p className="text-sm text-gray-500 text-center py-4">No {title.toLowerCase()} yet</p>
      ) : (
        <ul className="divide-y divide-gray-200 max-h-64 overflow-y-auto">
          {items?.map((item) => (
            <li key={item.id} className="flex items-center justify-between py-2">
              <div>
                <span className="text-sm font-medium">{item.name}</span>
                {item._count?.assets !== undefined && (
                  <span className="ml-2 text-xs text-gray-500">
                    ({item._count.assets} asset{item._count.assets !== 1 ? 's' : ''})
                  </span>
                )}
              </div>
              <button
                onClick={() => handleDelete(item.id, item.name, item._count?.assets)}
                disabled={deleteMutation.isPending}
                className="p-1 text-gray-400 hover:text-red-600 transition-colors"
                title="Delete"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function LookupsTab() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <LookupManager
        title="Categories"
        queryKey="categories"
        fetchFn={api.getCategories}
        createFn={api.createCategory}
        deleteFn={api.deleteCategory}
      />
      <LookupManager
        title="Manufacturers"
        queryKey="manufacturers"
        fetchFn={api.getManufacturers}
        createFn={api.createManufacturer}
        deleteFn={api.deleteManufacturer}
      />
      <LookupManager
        title="Suppliers"
        queryKey="suppliers"
        fetchFn={api.getSuppliers}
        createFn={api.createSupplier}
        deleteFn={api.deleteSupplier}
      />
      <LookupManager
        title="Locations"
        queryKey="locations"
        fetchFn={api.getLocations}
        createFn={api.createLocation}
        deleteFn={api.deleteLocation}
      />
    </div>
  );
}
