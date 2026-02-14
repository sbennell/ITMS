import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { ArrowLeft, Save, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { api, BulkAddResult } from '../lib/api';
import { STATUS_LABELS, CONDITION_LABELS } from '../lib/utils';

type BulkAddFormData = {
  manufacturerId: string;
  model: string;
  categoryId: string;
  description: string;
  status: string;
  condition: string;
  acquiredDate: string;
  purchasePrice: string;
  supplierId: string;
  orderNumber: string;
  locationId: string;
  warrantyExpiration: string;
  endOfLifeDate: string;
  comments: string;
};

export default function BulkAddAssets() {
  const queryClient = useQueryClient();
  const [serialNumbersText, setSerialNumbersText] = useState('');
  const [assignedToText, setAssignedToText] = useState('');
  const [result, setResult] = useState<BulkAddResult | null>(null);

  const { register, handleSubmit, reset } = useForm<BulkAddFormData>({
    defaultValues: {
      status: 'In Use',
      condition: 'GOOD'
    }
  });

  // Fetch next item number for preview
  const { data: nextItemData } = useQuery({
    queryKey: ['next-item-number'],
    queryFn: api.getNextItemNumber
  });

  // Fetch lookups
  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: api.getCategories
  });
  const { data: manufacturers } = useQuery({
    queryKey: ['manufacturers'],
    queryFn: api.getManufacturers
  });
  const { data: suppliers } = useQuery({
    queryKey: ['suppliers'],
    queryFn: api.getSuppliers
  });
  const { data: locations } = useQuery({
    queryKey: ['locations'],
    queryFn: api.getLocations
  });

  const bulkMutation = useMutation({
    mutationFn: (data: { sharedFields: Record<string, any>; serialNumbers: string[]; assignedToList: string[] }) =>
      api.bulkCreateAssets(data),
    onSuccess: (data) => {
      setResult(data);
      queryClient.invalidateQueries({ queryKey: ['assets'] });
      queryClient.invalidateQueries({ queryKey: ['next-item-number'] });
    }
  });

  const serialNumbers = serialNumbersText
    .split('\n')
    .map(s => s.trim())
    .filter(s => s.length > 0);

  const assignedToList = assignedToText
    .split('\n')
    .map(s => s.trim());

  const onSubmit = (data: BulkAddFormData) => {
    if (serialNumbers.length === 0) return;

    const cleanData: Record<string, any> = {};
    Object.entries(data).forEach(([key, value]) => {
      cleanData[key] = value === '' ? null : value;
    });

    bulkMutation.mutate({
      sharedFields: cleanData,
      serialNumbers,
      assignedToList
    });
  };

  // Results view
  if (result) {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Link to="/assets" className="p-2 rounded-md hover:bg-gray-100">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">Bulk Add Results</h1>
        </div>

        <div className="card p-6">
          <div className="space-y-3">
            {result.created > 0 && (
              <div className="flex items-center gap-2 text-green-700">
                <CheckCircle2 className="w-5 h-5" />
                <span className="text-lg font-medium">
                  {result.created} asset{result.created !== 1 ? 's' : ''} created successfully
                </span>
              </div>
            )}
            {result.failed > 0 && (
              <div className="flex items-center gap-2 text-red-700">
                <AlertCircle className="w-5 h-5" />
                <span className="text-lg font-medium">
                  {result.failed} failed
                </span>
              </div>
            )}
            {result.errors.length > 0 && (
              <div className="mt-4">
                <p className="text-sm font-medium text-red-700 mb-2">Errors:</p>
                <ul className="text-sm text-red-600 space-y-1 max-h-48 overflow-y-auto">
                  {result.errors.map((err, i) => (
                    <li key={i}>S/N &quot;{err.serialNumber}&quot;: {err.message}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <div className="mt-6 flex gap-3">
            <Link to="/assets" className="btn btn-primary">
              View Assets
            </Link>
            <button
              onClick={() => { setResult(null); setSerialNumbersText(''); setAssignedToText(''); reset(); }}
              className="btn btn-secondary"
            >
              Add More
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link to="/assets" className="p-2 rounded-md hover:bg-gray-100">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Bulk Add Assets</h1>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {bulkMutation.error && (
          <div className="rounded-md bg-red-50 p-4">
            <p className="text-sm text-red-700">{(bulkMutation.error as Error).message}</p>
          </div>
        )}

        {/* Serial Numbers & Assigned To */}
        <div className="card p-6">
          <h2 className="text-lg font-semibold mb-2">Serial Numbers & Assigned To</h2>
          <p className="text-sm text-gray-500 mb-4">
            Enter one serial number per line. Optionally enter a matching assigned-to name for each line.
            Item numbers will be assigned automatically starting from {nextItemData?.nextItemNumber || '...'}.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="label">Serial Numbers</label>
              <textarea
                value={serialNumbersText}
                onChange={(e) => setSerialNumbersText(e.target.value)}
                className="input font-mono"
                rows={8}
                placeholder={"SN-001\nSN-002\nSN-003"}
              />
            </div>
            <div>
              <label className="label">Assigned To</label>
              <textarea
                value={assignedToText}
                onChange={(e) => setAssignedToText(e.target.value)}
                className="input font-mono"
                rows={8}
                placeholder={"John Smith\nJane Doe\nIT Department"}
              />
            </div>
          </div>
          <p className="mt-2 text-sm text-gray-500">
            {serialNumbers.length} serial number{serialNumbers.length !== 1 ? 's' : ''} entered
            {serialNumbers.length > 0 && nextItemData?.nextItemNumber && (
              <> &mdash; item numbers {nextItemData.nextItemNumber} through {
                String(parseInt(nextItemData.nextItemNumber) + serialNumbers.length - 1)
              }</>
            )}
          </p>
        </div>

        {/* Shared Info */}
        <div className="card p-6">
          <h2 className="text-lg font-semibold mb-4">Shared Information</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="label">Manufacturer</label>
              <select {...register('manufacturerId')} className="input">
                <option value="">Select manufacturer...</option>
                {manufacturers?.map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Model</label>
              <input {...register('model')} className="input" />
            </div>
            <div>
              <label className="label">Category</label>
              <select {...register('categoryId')} className="input">
                <option value="">Select category...</option>
                {categories?.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Status</label>
              <select {...register('status')} className="input">
                {Object.entries(STATUS_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Condition</label>
              <select {...register('condition')} className="input">
                {Object.entries(CONDITION_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="label">Description</label>
              <textarea {...register('description')} className="input" rows={3} />
            </div>
          </div>
        </div>

        {/* Purchase Info */}
        <div className="card p-6">
          <h2 className="text-lg font-semibold mb-4">Purchase Information</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="label">Acquired Date</label>
              <input {...register('acquiredDate')} type="date" className="input" />
            </div>
            <div>
              <label className="label">Purchase Price</label>
              <input {...register('purchasePrice')} type="number" step="0.01" className="input" />
            </div>
            <div>
              <label className="label">Supplier</label>
              <select {...register('supplierId')} className="input">
                <option value="">Select supplier...</option>
                {suppliers?.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Order Number</label>
              <input {...register('orderNumber')} className="input" />
            </div>
          </div>
        </div>

        {/* Location */}
        <div className="card p-6">
          <h2 className="text-lg font-semibold mb-4">Location</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="label">Location</label>
              <select {...register('locationId')} className="input">
                <option value="">Select location...</option>
                {locations?.map((l) => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Lifecycle */}
        <div className="card p-6">
          <h2 className="text-lg font-semibold mb-4">Lifecycle</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="label">Warranty Expiration</label>
              <input {...register('warrantyExpiration')} type="date" className="input" />
            </div>
            <div>
              <label className="label">End of Life Date</label>
              <input {...register('endOfLifeDate')} type="date" className="input" />
            </div>
          </div>
        </div>

        {/* Comments */}
        <div className="card p-6">
          <h2 className="text-lg font-semibold mb-4">Comments</h2>
          <textarea {...register('comments')} className="input" rows={4} />
        </div>

        {/* Submit */}
        <div className="flex justify-end gap-4">
          <Link to="/assets" className="btn btn-secondary">Cancel</Link>
          <button
            type="submit"
            disabled={serialNumbers.length === 0 || bulkMutation.isPending}
            className="btn btn-primary"
          >
            {bulkMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Creating {serialNumbers.length} Assets...
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                Create {serialNumbers.length} Asset{serialNumbers.length !== 1 ? 's' : ''}
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
