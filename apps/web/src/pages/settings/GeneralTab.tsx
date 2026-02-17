import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Building2, Printer } from 'lucide-react';
import { api, LabelSettings as LabelSettingsType } from '../../lib/api';

function OrganizationSetting() {
  const [organization, setOrganization] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['settings', 'organization'],
    queryFn: () => api.getSetting('organization')
  });

  useEffect(() => {
    if (data?.value) {
      setOrganization(data.value);
    }
  }, [data]);

  const mutation = useMutation({
    mutationFn: (value: string) => api.updateSetting('organization', value),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings', 'organization'] });
      setSuccess('Organization saved successfully');
      setError('');
    },
    onError: (err: Error) => {
      setError(err.message);
      setSuccess('');
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    mutation.mutate(organization);
  };

  return (
    <div className="card p-6 mb-6">
      <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
        <Building2 className="w-5 h-5" />
        Organization
      </h2>

      {error && (
        <div className="mb-4 p-3 bg-red-50 text-red-700 text-sm rounded-md">{error}</div>
      )}
      {success && (
        <div className="mb-4 p-3 bg-green-50 text-green-700 text-sm rounded-md">{success}</div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="label">Organization Name</label>
          <input
            type="text"
            value={organization}
            onChange={(e) => setOrganization(e.target.value)}
            placeholder="Enter organization name..."
            className="input"
            disabled={isLoading}
          />
        </div>
        <button
          type="submit"
          disabled={mutation.isPending || isLoading}
          className="btn btn-primary"
        >
          {mutation.isPending ? 'Saving...' : 'Save'}
        </button>
      </form>
    </div>
  );
}

function LabelSettingsSection() {
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const queryClient = useQueryClient();

  const { data: settings, isLoading: settingsLoading } = useQuery({
    queryKey: ['labelSettings'],
    queryFn: api.getLabelSettings
  });

  const { data: printers, isLoading: printersLoading } = useQuery({
    queryKey: ['printers'],
    queryFn: api.getPrinters
  });

  const mutation = useMutation({
    mutationFn: (updates: Partial<LabelSettingsType>) => api.updateLabelSettings(updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['labelSettings'] });
      setSuccess('Label settings saved');
      setError('');
      setTimeout(() => setSuccess(''), 3000);
    },
    onError: (err: Error) => {
      setError(err.message);
      setSuccess('');
    }
  });

  const handlePrinterChange = (printerName: string) => {
    mutation.mutate({ printerName });
  };

  const handleToggle = (field: keyof LabelSettingsType, value: boolean) => {
    mutation.mutate({ [field]: value });
  };

  const isLoading = settingsLoading || printersLoading;

  return (
    <div className="card p-6">
      <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
        <Printer className="w-5 h-5" />
        Label Printing
      </h2>

      {error && (
        <div className="mb-4 p-3 bg-red-50 text-red-700 text-sm rounded-md">{error}</div>
      )}
      {success && (
        <div className="mb-4 p-3 bg-green-50 text-green-700 text-sm rounded-md">{success}</div>
      )}

      {isLoading ? (
        <div className="text-center py-4">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600 mx-auto"></div>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Printer Selection */}
          <div>
            <label className="label">Printer</label>
            <select
              value={settings?.printerName || ''}
              onChange={(e) => handlePrinterChange(e.target.value)}
              className="input"
              disabled={mutation.isPending}
            >
              <option value="">Select a printer...</option>
              {printers?.map((printer) => (
                <option key={printer} value={printer}>{printer}</option>
              ))}
              {settings?.printerName && !printers?.includes(settings.printerName) && (
                <option value={settings.printerName}>{settings.printerName} (not found)</option>
              )}
            </select>
            {printers?.length === 0 && (
              <p className="mt-1 text-xs text-gray-500">No printers detected</p>
            )}
          </div>

          {/* Label Content Options */}
          <div>
            <label className="label">Optional Fields</label>
            <p className="text-xs text-gray-500 mb-2">Item Number, Model, and S/N are always shown</p>
            <div className="space-y-2">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={settings?.showAssignedTo ?? true}
                  onChange={(e) => handleToggle('showAssignedTo', e.target.checked)}
                  disabled={mutation.isPending}
                  className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                />
                <span className="text-sm text-gray-700">Show Assigned To</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={settings?.showHostname ?? true}
                  onChange={(e) => handleToggle('showHostname', e.target.checked)}
                  disabled={mutation.isPending}
                  className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                />
                <span className="text-sm text-gray-700">Show Hostname</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={settings?.showIpAddress ?? true}
                  onChange={(e) => handleToggle('showIpAddress', e.target.checked)}
                  disabled={mutation.isPending}
                  className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                />
                <span className="text-sm text-gray-700">Show IP Address</span>
              </label>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function GeneralTab() {
  return (
    <div>
      <OrganizationSetting />
      <LabelSettingsSection />
    </div>
  );
}
