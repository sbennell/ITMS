import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, CheckCircle, Loader } from 'lucide-react';
import { api, StudentImportResult, ReconcileResult } from '../../lib/api';

const STUDENT_FIELDS = [
  { key: 'firstName', label: 'First Name', required: true },
  { key: 'surname', label: 'Surname', required: true },
  { key: 'prefName', label: 'Preferred Name', required: false },
  { key: 'homeGroup', label: 'Home Group', required: false },
  { key: 'schoolYear', label: 'School Year', required: false },
  { key: 'status', label: 'Status', required: false },
  { key: 'birthdate', label: 'Date of Birth', required: false },
  { key: 'username', label: 'Username', required: false },
  { key: 'edupassUsername', label: 'EduPass Username', required: false },
  { key: 'email', label: 'Email', required: false },
  { key: 'password', label: 'Password', required: false }
];

export default function StudentsTab() {
  const queryClient = useQueryClient();
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [importFile, setImportFile] = useState('');
  const [schoolType, setSchoolType] = useState('STANDARD');
  const [importResult, setImportResult] = useState<StudentImportResult | null>(null);
  const [reconcileOnImport, setReconcileOnImport] = useState(false);
  const [reconcileResult, setReconcileResult] = useState<ReconcileResult | null>(null);

  // Load settings
  useQuery({
    queryKey: ['settings', 'schoolType'],
    queryFn: () => api.getSetting('schoolType').then(s => {
      setSchoolType(s.value);
      return s;
    }),
    staleTime: 1000 * 60
  });

  useQuery({
    queryKey: ['settings', 'studentImportFile'],
    queryFn: () => api.getSetting('studentImportFile').then(s => {
      setImportFile(s.value || '');
      return s;
    }).catch(() => {
      setImportFile('');
      return { key: 'studentImportFile', value: '' };
    }),
    staleTime: 1000 * 60
  });

  const { data: csvHeaders = [], isError: headersError } = useQuery({
    queryKey: ['studentImportHeaders'],
    queryFn: api.getStudentImportHeaders,
    enabled: !!importFile,
    retry: false
  });

  useQuery({
    queryKey: ['settings', 'studentCsvMapping'],
    queryFn: () => api.getSetting('studentCsvMapping').then(s => {
      try {
        setMapping(JSON.parse(s.value));
      } catch {}
      return s;
    }),
    staleTime: 1000 * 60
  });

  useQuery({
    queryKey: ['settings', 'studentLastImport'],
    queryFn: () => api.getSetting('studentLastImport').then(s => s),
    staleTime: 1000 * 60
  });

  useQuery({
    queryKey: ['settings', 'studentReconcileOnImport'],
    queryFn: () => api.getSetting('studentReconcileOnImport').then(s => {
      setReconcileOnImport(s.value === 'true');
      return s;
    }).catch(() => {
      setReconcileOnImport(false);
      return { key: 'studentReconcileOnImport', value: 'false' };
    }),
    staleTime: 1000 * 60
  });

  const schoolTypeMutation = useMutation({
    mutationFn: (value: string) => api.updateSetting('schoolType', value),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings', 'schoolType'] });
    }
  });

  const fileMutation = useMutation({
    mutationFn: (value: string) => api.updateSetting('studentImportFile', value),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings', 'studentImportFile'] });
      queryClient.invalidateQueries({ queryKey: ['studentImportHeaders'] });
    }
  });

  const reconcileOnImportMutation = useMutation({
    mutationFn: (value: boolean) => api.updateSetting('studentReconcileOnImport', value ? 'true' : 'false'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings', 'studentReconcileOnImport'] });
    }
  });

  const reconcileMutation = useMutation({
    mutationFn: () => api.reconcileStudentAssets(),
    onSuccess: (result) => {
      setReconcileResult(result);
      queryClient.invalidateQueries({ queryKey: ['students'] });
      queryClient.invalidateQueries({ queryKey: ['assets'] });
      setTimeout(() => setReconcileResult(null), 6000);
    }
  });

  const mappingMutation = useMutation({
    mutationFn: (value: Record<string, string>) =>
      api.updateSetting('studentCsvMapping', JSON.stringify(value)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings', 'studentCsvMapping'] });
    }
  });

  const importMutation = useMutation({
    mutationFn: () => api.runStudentImport(),
    onSuccess: (result) => {
      setImportResult(result);
      queryClient.invalidateQueries({ queryKey: ['students'] });
      setTimeout(() => setImportResult(null), 5000);
    }
  });

  const handleSaveMapping = () => {
    mappingMutation.mutate(mapping);
  };

  return (
    <div className="space-y-6">
      {/* School Type */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold mb-4">School Type</h3>
        <p className="text-sm text-gray-600 mb-4">
          Select your school type. Department of Education schools have additional EduPass username field.
        </p>
        <div className="flex gap-4">
          {['STANDARD', 'DE'].map((type) => (
            <label key={type} className="flex items-center gap-2">
              <input
                type="radio"
                name="schoolType"
                value={type}
                checked={schoolType === type}
                onChange={(e) => {
                  setSchoolType(e.target.value);
                  schoolTypeMutation.mutate(e.target.value);
                }}
                disabled={schoolTypeMutation.isPending}
              />
              <span className="text-sm">
                {type === 'DE' ? 'Department of Education' : 'Standard'}
              </span>
            </label>
          ))}
        </div>
      </div>

      {/* Import File */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold mb-4">Import File</h3>
        <p className="text-sm text-gray-600 mb-4">
          The full path to the CSV file to automatically import student records from.
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            value={importFile}
            onChange={(e) => setImportFile(e.target.value)}
            placeholder="e.g., C:\data\students\students.csv"
            className="input flex-1"
          />
          <button
            onClick={() => fileMutation.mutate(importFile)}
            disabled={fileMutation.isPending}
            className="btn btn-primary"
          >
            {fileMutation.isPending ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>

      {/* CSV Column Mapping */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold mb-4">CSV Column Mapping</h3>
        <p className="text-sm text-gray-600 mb-4">
          Map the columns in your CSV file to student fields. The importer will match by these headers.
        </p>

        {/* Status messages */}
        {!importFile && (
          <div className="mb-6 p-3 bg-amber-50 rounded-lg border border-amber-200 text-sm text-amber-700">
            Set the Import File path above to load available headers.
          </div>
        )}
        {importFile && csvHeaders.length === 0 && !headersError && (
          <div className="mb-6 p-3 bg-blue-50 rounded-lg border border-blue-200 text-sm text-blue-700">
            Reading headers from file...
          </div>
        )}
        {headersError && (
          <div className="mb-6 p-3 bg-red-50 rounded-lg border border-red-200 text-sm text-red-700">
            Could not read headers — check the file path is correct.
          </div>
        )}

        {/* Mapping Table */}
        <div className="overflow-x-auto border rounded-lg">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-700">Internal Field</th>
                <th className="px-4 py-3 text-left font-medium text-gray-700">Select CSV Column</th>
              </tr>
            </thead>
            <tbody>
              {STUDENT_FIELDS.map((field) => (
                <tr key={field.key} className="border-b hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <span className="text-sm font-medium text-gray-900">
                      {field.label}
                      {field.required && <span className="text-red-500">*</span>}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={mapping[field.key] || ''}
                      onChange={(e) =>
                        setMapping({ ...mapping, [field.key]: e.target.value })
                      }
                      className="input text-sm w-full"
                      disabled={csvHeaders.length === 0}
                    >
                      <option value="">— Not mapped —</option>
                      {csvHeaders.map((header) => (
                        <option key={header} value={header}>
                          {header}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <button
          onClick={handleSaveMapping}
          disabled={mappingMutation.isPending}
          className="btn btn-primary mt-4"
        >
          {mappingMutation.isPending ? 'Saving...' : 'Save Mapping'}
        </button>
      </div>

      {/* Manual Import Trigger */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold mb-4">Manual Import</h3>
        <p className="text-sm text-gray-600 mb-4">
          Trigger an import of the CSV/Excel file from the configured folder.
        </p>

        <button
          onClick={() => importMutation.mutate()}
          disabled={importMutation.isPending || !importFile}
          className="btn btn-primary"
        >
          {importMutation.isPending ? (
            <>
              <Loader size={18} className="animate-spin mr-2" />
              Importing...
            </>
          ) : (
            'Run Import Now'
          )}
        </button>

        {importResult && (
          <div className={`mt-4 p-4 rounded-lg ${
            importResult.errors.length === 0 ? 'bg-green-50 border border-green-200' : 'bg-yellow-50 border border-yellow-200'
          }`}>
            {importResult.errors.length === 0 ? (
              <div className="flex gap-2 text-green-700">
                <CheckCircle size={18} />
                <div>
                  <p className="font-medium">Import successful</p>
                  <p className="text-sm">
                    {importResult.created} created, {importResult.updated} updated
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex gap-2 text-yellow-700">
                <AlertCircle size={18} />
                <div>
                  <p className="font-medium">Import completed with errors</p>
                  <ul className="text-sm mt-2 space-y-1">
                    {importResult.errors.slice(0, 5).map((err, idx) => (
                      <li key={idx}>Row {err.row}: {err.message}</li>
                    ))}
                    {importResult.errors.length > 5 && (
                      <li>... and {importResult.errors.length - 5} more errors</li>
                    )}
                  </ul>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Link by Name */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold mb-4">Link Existing Assignments by Name</h3>
        <p className="text-sm text-gray-600 mb-4">
          Scans assets where Assigned To contains a student's name and links them automatically.
        </p>

        <div className="mb-4 flex items-center gap-3">
          <input
            type="checkbox"
            id="reconcileOnImport"
            checked={reconcileOnImport}
            onChange={(e) => {
              setReconcileOnImport(e.target.checked);
              reconcileOnImportMutation.mutate(e.target.checked);
            }}
            disabled={reconcileOnImportMutation.isPending}
            className="w-4 h-4"
          />
          <label htmlFor="reconcileOnImport" className="text-sm text-gray-700">
            Run automatically after each import
          </label>
        </div>

        <button
          onClick={() => reconcileMutation.mutate()}
          disabled={reconcileMutation.isPending}
          className="btn btn-primary"
        >
          {reconcileMutation.isPending ? (
            <>
              <Loader size={18} className="animate-spin mr-2" />
              Linking...
            </>
          ) : (
            'Link by Name Now'
          )}
        </button>

        {reconcileResult && (
          <div className={`mt-4 p-4 rounded-lg ${
            reconcileResult.skipped === 0 ? 'bg-green-50 border border-green-200' : 'bg-blue-50 border border-blue-200'
          }`}>
            <div className="flex gap-2 text-green-700">
              <CheckCircle size={18} />
              <div>
                <p className="font-medium">{reconcileResult.linked} linked, {reconcileResult.skipped} skipped</p>
                {reconcileResult.unmatched.length > 0 && (
                  <p className="text-sm mt-2">
                    Unmatched: {reconcileResult.unmatched.join(', ')}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
