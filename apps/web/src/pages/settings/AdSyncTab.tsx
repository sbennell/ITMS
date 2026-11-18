import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, CheckCircle, Loader } from 'lucide-react';
import { api, AdSyncResult, AdSyncRun } from '../../lib/api';

interface AdSyncConfig {
  enabled: boolean;
  studentsOU: string;
  inactiveOU: string;
  yearGroupsOU: string;
  studentsGroupDN: string;
  staffGroupDN: string;
  logonScript: string;
  driveRootPath: string;
  driveInactiveFolder: string;
  secondaryRootPath: string;
  homeDrive: string;
  homeShareRoot: string;
  organizeBy: 'Form' | 'YearLevel';
  folderNameFormat: 'FirstnameLastname' | 'LastnameFirstname';
}

const DEFAULT_CONFIG: AdSyncConfig = {
  enabled: false,
  studentsOU: '',
  inactiveOU: '',
  yearGroupsOU: '',
  studentsGroupDN: '',
  staffGroupDN: '',
  logonScript: 'default.bat',
  driveRootPath: '',
  driveInactiveFolder: '',
  secondaryRootPath: '',
  homeDrive: 'H:',
  homeShareRoot: '',
  organizeBy: 'Form',
  folderNameFormat: 'FirstnameLastname'
};

const TEXT_FIELDS: Array<{ key: keyof AdSyncConfig; label: string; placeholder: string }> = [
  { key: 'studentsOU', label: 'Students OU', placeholder: 'OU=Students,OU=Users,OU=School,DC=domain,DC=local' },
  { key: 'inactiveOU', label: 'Inactive OU', placeholder: 'OU=Students,OU=Inactive Accounts,DC=domain,DC=local' },
  { key: 'yearGroupsOU', label: 'Year and Form Groups OU', placeholder: 'OU=Student Groups,OU=Groups,OU=School,DC=domain,DC=local' },
  { key: 'studentsGroupDN', label: 'Students Group', placeholder: 'CN=Students,OU=Student Groups,OU=Groups,OU=School,DC=domain,DC=local' },
  { key: 'staffGroupDN', label: 'Staff Group (folder permissions)', placeholder: 'CN=Staff,OU=Staff Groups,OU=Groups,OU=School,DC=domain,DC=local' },
  { key: 'logonScript', label: 'Logon Script', placeholder: 'default.bat' },
  { key: 'driveRootPath', label: 'Student Folder Root (blank to skip folders)', placeholder: 'D:\\WORK\\Students' },
  { key: 'driveInactiveFolder', label: 'Inactive Folder', placeholder: 'D:\\WORK\\Students\\Inactive' },
  { key: 'homeShareRoot', label: 'Home Folder Share, the share path of the Student Folder Root (blank to leave the account profile alone)', placeholder: '\\\\fileserver\\Students$' },
  { key: 'homeDrive', label: 'Home Drive Letter', placeholder: 'H:' },
  { key: 'secondaryRootPath', label: 'Secondary Folder Root (blank to skip). Folders are made as Root\\Year\\Year Level\\Home Group\\Student and never moved', placeholder: 'D:\\WORK\\Submit' }
];

const GROUPS: Array<{ action: AdSyncResult['action']; label: string }> = [
  { action: 'setup', label: 'Setup' },
  { action: 'create', label: 'Create' },
  { action: 'update', label: 'Update' },
  { action: 'disable', label: 'Disable' }
];

export default function AdSyncTab() {
  const queryClient = useQueryClient();
  const [config, setConfig] = useState<AdSyncConfig>(DEFAULT_CONFIG);
  const [saveResult, setSaveResult] = useState<'success' | 'error' | null>(null);
  const [run, setRun] = useState<AdSyncRun | null>(null);
  const [runError, setRunError] = useState<string | null>(null);

  useQuery({
    queryKey: ['settings', 'adSyncConfig'],
    queryFn: () => api.getSetting('adSyncConfig').then(s => {
      try {
        setConfig({ ...DEFAULT_CONFIG, ...JSON.parse(s.value) });
      } catch {}
      return s;
    }).catch(() => ({ key: 'adSyncConfig', value: '' })),
    staleTime: 0
  });

  const { data: lastRun } = useQuery({
    queryKey: ['settings', 'adSyncLastRun'],
    queryFn: () => api.getSetting('adSyncLastRun').then(s => s.value || null).catch(() => null)
  });

  const saveMutation = useMutation({
    mutationFn: (value: AdSyncConfig) => api.updateSetting('adSyncConfig', JSON.stringify(value)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings', 'adSyncConfig'] });
      setSaveResult('success');
      setTimeout(() => setSaveResult(null), 3000);
    },
    onError: () => {
      setSaveResult('error');
      setTimeout(() => setSaveResult(null), 3000);
    }
  });

  const runMutation = useMutation({
    mutationFn: (mode: 'preview' | 'apply') => api.runAdSync(mode),
    onMutate: () => setRunError(null),
    onSuccess: (result) => {
      setRun(result);
      if (result.mode === 'Apply') {
        queryClient.invalidateQueries({ queryKey: ['settings', 'adSyncLastRun'] });
      }
    },
    onError: (error: Error) => {
      setRun(null);
      setRunError(error.message);
    }
  });

  const handleApply = () => {
    if (window.confirm('Apply these changes to Active Directory and the student folders? Every student\'s AD password is also reset to the one in ITMS.')) {
      runMutation.mutate('apply');
    }
  };

  const count = (action: AdSyncResult['action']) => run?.results.filter(r => r.ok && r.action === action).length ?? 0;
  const failed = run?.results.filter(r => !r.ok) ?? [];

  return (
    <div className="space-y-6">
      {/* Settings */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold mb-4">AD Account and Folder Settings</h3>
        <p className="text-sm text-gray-600 mb-4">
          Creates, updates and disables student accounts in Active Directory and manages their home folders,
          using the students from the import. Accounts go in an OU named after the student's home group, inside
          the Students OU. The ITMS server needs the ActiveDirectory PowerShell module (RSAT), and the ITMS service
          account needs rights over these OUs and the student folder root.
        </p>

        <div className="mb-4 flex items-center gap-3">
          <input
            type="checkbox"
            id="adSyncEnabled"
            checked={config.enabled}
            onChange={(e) => setConfig({ ...config, enabled: e.target.checked })}
            className="w-4 h-4"
          />
          <label htmlFor="adSyncEnabled" className="text-sm text-gray-700">
            Enable AD sync (the import also starts recording leavers to disable)
          </label>
        </div>

        <div className="grid gap-4">
          {TEXT_FIELDS.map((field) => (
            <label key={field.key} className="block">
              <span className="text-sm font-medium text-gray-700">{field.label}</span>
              <input
                type="text"
                value={config[field.key] as string}
                onChange={(e) => setConfig({ ...config, [field.key]: e.target.value })}
                placeholder={field.placeholder}
                className="input w-full mt-1"
              />
            </label>
          ))}

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-sm font-medium text-gray-700">Organise Folders By</span>
              <select
                value={config.organizeBy}
                onChange={(e) => setConfig({ ...config, organizeBy: e.target.value as AdSyncConfig['organizeBy'] })}
                className="input w-full mt-1"
              >
                <option value="Form">Home Group</option>
                <option value="YearLevel">Year Level</option>
              </select>
            </label>
            <label className="block">
              <span className="text-sm font-medium text-gray-700">Folder Name</span>
              <select
                value={config.folderNameFormat}
                onChange={(e) => setConfig({ ...config, folderNameFormat: e.target.value as AdSyncConfig['folderNameFormat'] })}
                className="input w-full mt-1"
              >
                <option value="FirstnameLastname">Firstname Lastname</option>
                <option value="LastnameFirstname">Lastname Firstname</option>
              </select>
            </label>
          </div>
        </div>

        <button
          onClick={() => saveMutation.mutate(config)}
          disabled={saveMutation.isPending}
          className="btn btn-primary mt-4"
        >
          {saveMutation.isPending ? 'Saving...' : 'Save Settings'}
        </button>

        {saveResult && (
          <div className={`mt-3 p-3 rounded-lg text-sm ${
            saveResult === 'success'
              ? 'bg-green-50 border border-green-200 text-green-700'
              : 'bg-red-50 border border-red-200 text-red-700'
          }`}>
            {saveResult === 'success' ? 'Settings saved' : 'Failed to save settings'}
          </div>
        )}
      </div>

      {/* Preview and Apply */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold mb-4">Run AD Sync</h3>
        <p className="text-sm text-gray-600 mb-4">
          Preview lists the changes without making them. Apply makes them. Save any settings changes first.
        </p>

        <p className="text-sm text-gray-600 mb-4">
          {lastRun ? `Last applied: ${new Date(lastRun).toLocaleString()}` : 'Never applied'}
        </p>

        <div className="flex gap-2">
          <button
            onClick={() => runMutation.mutate('preview')}
            disabled={runMutation.isPending || !config.enabled}
            className="btn btn-secondary"
          >
            {runMutation.isPending && runMutation.variables === 'preview' ? (
              <>
                <Loader size={18} className="animate-spin mr-2" />
                Checking...
              </>
            ) : (
              'Preview'
            )}
          </button>
          <button
            onClick={handleApply}
            disabled={runMutation.isPending || run?.mode !== 'Preview'}
            className="btn btn-primary"
            title={run?.mode !== 'Preview' ? 'Run a preview first' : undefined}
          >
            {runMutation.isPending && runMutation.variables === 'apply' ? (
              <>
                <Loader size={18} className="animate-spin mr-2" />
                Applying...
              </>
            ) : (
              'Apply'
            )}
          </button>
        </div>

        {runError && (
          <div className="mt-4 p-3 bg-red-50 rounded-lg border border-red-200 text-sm text-red-700 flex gap-2">
            <AlertCircle size={18} className="shrink-0" />
            <span>{runError}</span>
          </div>
        )}

        {run && (
          <div className="mt-6 space-y-4">
            <div className={`p-3 rounded-lg text-sm flex gap-2 ${
              failed.length === 0 ? 'bg-green-50 border border-green-200 text-green-700' : 'bg-yellow-50 border border-yellow-200 text-yellow-700'
            }`}>
              {failed.length === 0 ? <CheckCircle size={18} className="shrink-0" /> : <AlertCircle size={18} className="shrink-0" />}
              <span>
                {run.mode === 'Preview' ? 'Preview' : 'Applied'}: {count('create')} create, {count('update')} update,{' '}
                {count('disable')} disable, {count('none')} unchanged{failed.length > 0 ? `, ${failed.length} failed` : ''}
              </span>
            </div>

            <ResultGroup title="Failed" results={failed} />
            {GROUPS.map(group => (
              <ResultGroup
                key={group.action}
                title={group.label}
                results={run.results.filter(r => r.ok && r.action === group.action)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ResultGroup({ title, results }: { title: string; results: AdSyncResult[] }) {
  if (results.length === 0) return null;
  return (
    <div>
      <h4 className="font-medium text-gray-900 mb-2">{title} ({results.length})</h4>
      <div className="overflow-x-auto border rounded-lg">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-4 py-2 text-left font-medium text-gray-700">Student</th>
              <th className="px-4 py-2 text-left font-medium text-gray-700">Changes</th>
            </tr>
          </thead>
          <tbody>
            {results.map((r, i) => (
              <tr key={`${r.username}-${i}`} className="border-b align-top">
                <td className="px-4 py-2 whitespace-nowrap">
                  {r.name}
                  {r.username && <span className="text-gray-500"> ({r.username})</span>}
                </td>
                <td className="px-4 py-2">
                  {r.error && <p className="text-red-700">{r.error}</p>}
                  <ul className="space-y-0.5">
                    {r.steps.map((step, j) => <li key={j}>{step}</li>)}
                  </ul>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
