import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Upload, Download, CheckCircle2, AlertCircle, FileSpreadsheet } from 'lucide-react';
import { api, ImportResult } from '../../lib/api';

function DataImport() {
  const [file, setFile] = useState<File | null>(null);
  const [skipDuplicates, setSkipDuplicates] = useState(false);
  const [updateExisting, setUpdateExisting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const queryClient = useQueryClient();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      if (!selectedFile.name.endsWith('.csv') && !selectedFile.name.endsWith('.xlsx')) {
        setError('Please select an Excel (.xlsx) or CSV file');
        return;
      }
      setFile(selectedFile);
      setResult(null);
      setError('');
    }
  };

  const handleImport = async () => {
    if (!file) return;

    setIsImporting(true);
    setError('');
    setResult(null);

    try {
      const importResult = await api.importAssets(file, { skipDuplicates, updateExisting });
      setResult(importResult);
      setFile(null);
      // Reset file input
      const fileInput = document.getElementById('import-file-input') as HTMLInputElement;
      if (fileInput) fileInput.value = '';
      // Refresh asset list
      queryClient.invalidateQueries({ queryKey: ['assets'] });
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      queryClient.invalidateQueries({ queryKey: ['manufacturers'] });
      queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      queryClient.invalidateQueries({ queryKey: ['locations'] });
    } catch (err: any) {
      setError(err.message || 'Import failed');
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="card p-6">
      <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
        <FileSpreadsheet className="w-5 h-5" />
        Data Import / Export
      </h2>

      <p className="text-sm text-gray-600 mb-4">
        Export all assets to Excel or import assets from an Excel/CSV file. The template includes dropdowns for easy data entry.
      </p>

      {/* Export / Download Template */}
      <div className="mb-6 flex flex-wrap gap-3">
        <button
          onClick={() => api.exportAssets()}
          className="btn btn-primary"
        >
          <Download className="w-4 h-4 mr-2" />
          Export All Assets
        </button>
        <button
          onClick={() => api.downloadImportTemplate()}
          className="btn btn-secondary"
        >
          <Download className="w-4 h-4 mr-2" />
          Download Import Template
        </button>
      </div>

      {/* File Upload */}
      <div className="mb-4">
        <label className="label">Select Excel or CSV File</label>
        <div className="flex items-center gap-4">
          <input
            id="import-file-input"
            type="file"
            accept=".xlsx,.csv"
            onChange={handleFileChange}
            className="block w-full text-sm text-gray-500
              file:mr-4 file:py-2 file:px-4
              file:rounded-md file:border-0
              file:text-sm file:font-medium
              file:bg-primary-50 file:text-primary-700
              hover:file:bg-primary-100
              cursor-pointer"
          />
        </div>
        {file && (
          <p className="mt-2 text-sm text-gray-600">
            Selected: {file.name} ({(file.size / 1024).toFixed(1)} KB)
          </p>
        )}
      </div>

      {/* Options */}
      <div className="mb-6 space-y-2">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={skipDuplicates}
            onChange={(e) => {
              setSkipDuplicates(e.target.checked);
              if (e.target.checked) setUpdateExisting(false);
            }}
            className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
          />
          <span className="text-sm text-gray-700">Skip duplicate item numbers</span>
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={updateExisting}
            onChange={(e) => {
              setUpdateExisting(e.target.checked);
              if (e.target.checked) setSkipDuplicates(false);
            }}
            className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
          />
          <span className="text-sm text-gray-700">Update existing assets (match by item number)</span>
        </label>
      </div>

      {/* Import Button */}
      <button
        onClick={handleImport}
        disabled={!file || isImporting}
        className="btn btn-primary"
      >
        {isImporting ? (
          <>
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
            Importing...
          </>
        ) : (
          <>
            <Upload className="w-4 h-4 mr-2" />
            Import Assets
          </>
        )}
      </button>

      {/* Error */}
      {error && (
        <div className="mt-4 p-3 bg-red-50 text-red-700 text-sm rounded-md flex items-start gap-2">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="mt-4 p-4 bg-gray-50 rounded-md">
          <h3 className="font-medium text-gray-900 mb-3">Import Results</h3>
          <div className="space-y-2">
            {result.created > 0 && (
              <div className="flex items-center gap-2 text-green-700">
                <CheckCircle2 className="w-4 h-4" />
                <span>{result.created} asset{result.created !== 1 ? 's' : ''} created</span>
              </div>
            )}
            {result.updated > 0 && (
              <div className="flex items-center gap-2 text-blue-700">
                <CheckCircle2 className="w-4 h-4" />
                <span>{result.updated} asset{result.updated !== 1 ? 's' : ''} updated</span>
              </div>
            )}
            {result.skipped > 0 && (
              <div className="flex items-center gap-2 text-yellow-700">
                <AlertCircle className="w-4 h-4" />
                <span>{result.skipped} row{result.skipped !== 1 ? 's' : ''} skipped (duplicates)</span>
              </div>
            )}
            {result.errors.length > 0 && (
              <div className="mt-3">
                <p className="text-red-700 font-medium mb-2">
                  {result.errors.length} error{result.errors.length !== 1 ? 's' : ''}:
                </p>
                <ul className="text-sm text-red-600 space-y-1 max-h-32 overflow-y-auto">
                  {result.errors.map((err, i) => (
                    <li key={i}>Row {err.row}: {err.message}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function DataTab() {
  return <DataImport />;
}
