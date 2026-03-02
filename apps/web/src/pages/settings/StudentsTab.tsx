import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, CheckCircle, Loader } from 'lucide-react';
import { api, StudentImportResult } from '../../lib/api';

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
  const [importPath, setImportPath] = useState('');
  const [importFilename, setImportFilename] = useState('');
  const [schoolType, setSchoolType] = useState('STANDARD');
  const [csvPreview, setCsvPreview] = useState('');
  const [importResult, setImportResult] = useState<StudentImportResult | null>(null);

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
    queryKey: ['settings', 'studentImportPath'],
    queryFn: () => api.getSetting('studentImportPath').then(s => {
      setImportPath(s.value);
      return s;
    }),
    staleTime: 1000 * 60
  });

  useQuery({
    queryKey: ['settings', 'studentImportFilename'],
    queryFn: () => api.getSetting('studentImportFilename').then(s => {
      setImportFilename(s.value || '');
      return s;
    }).catch(() => {
      setImportFilename('');
      return { key: 'studentImportFilename', value: '' };
    }),
    staleTime: 1000 * 60
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

  const schoolTypeMutation = useMutation({
    mutationFn: (value: string) => api.updateSetting('schoolType', value),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings', 'schoolType'] });
    }
  });

  const pathMutation = useMutation({
    mutationFn: (value: string) => api.updateSetting('studentImportPath', value),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings', 'studentImportPath'] });
    }
  });

  const filenameMutation = useMutation({
    mutationFn: (value: string) => api.updateSetting('studentImportFilename', value),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings', 'studentImportFilename'] });
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

  const handlePreviewHeaders = () => {
    if (!csvPreview.trim()) return;
    const headers = csvPreview.split(/[,\t]/).map(h => h.trim());
    const newMapping: Record<string, string> = {};
    headers.forEach((header, idx) => {
      const field = STUDENT_FIELDS[idx];
      if (field) newMapping[field.key] = header;
    });
    setMapping(newMapping);
  };

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

      {/* Import Path */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold mb-4">Auto-Import Folder</h3>
        <p className="text-sm text-gray-600 mb-4">
          The folder path where student CSV/Excel files are placed for automatic import.
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            value={importPath}
            onChange={(e) => setImportPath(e.target.value)}
            placeholder="e.g., /data/student-import"
            className="input flex-1"
          />
          <button
            onClick={() => pathMutation.mutate(importPath)}
            disabled={pathMutation.isPending}
            className="btn btn-primary"
          >
            {pathMutation.isPending ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>

      {/* Import Filename */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold mb-4">Import Filename (Optional)</h3>
        <p className="text-sm text-gray-600 mb-4">
          If set, only this specific filename will be imported. Leave blank to import any CSV/Excel file found in the folder.
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            value={importFilename}
            onChange={(e) => setImportFilename(e.target.value)}
            placeholder="e.g., student_master_list.csv"
            className="input flex-1"
          />
          <button
            onClick={() => filenameMutation.mutate(importFilename)}
            disabled={filenameMutation.isPending}
            className="btn btn-primary"
          >
            {filenameMutation.isPending ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>

      {/* CSV Column Mapping */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold mb-4">CSV Column Mapping</h3>
        <p className="text-sm text-gray-600 mb-4">
          Map the columns in your CSV file to student fields. The importer will match by these headers.
        </p>

        {/* Preview Helper */}
        <div className="mb-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
          <p className="text-sm font-medium text-blue-900 mb-2">Quick Setup: Paste CSV Headers</p>
          <textarea
            value={csvPreview}
            onChange={(e) => setCsvPreview(e.target.value)}
            placeholder="Paste the first row of your CSV (comma or tab separated)"
            className="input w-full text-sm mb-2"
            rows={2}
          />
          <button
            onClick={handlePreviewHeaders}
            className="btn btn-secondary text-sm"
          >
            Auto-fill from Headers
          </button>
        </div>

        {/* Mapping Table */}
        <div className="overflow-x-auto border rounded-lg">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-700">Internal Field</th>
                <th className="px-4 py-3 text-left font-medium text-gray-700">CSV Header Name</th>
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
                    <input
                      type="text"
                      value={mapping[field.key] || ''}
                      onChange={(e) =>
                        setMapping({ ...mapping, [field.key]: e.target.value })
                      }
                      placeholder="e.g., Given Name"
                      className="input text-sm w-full"
                    />
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
          disabled={importMutation.isPending || !importPath}
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
    </div>
  );
}
