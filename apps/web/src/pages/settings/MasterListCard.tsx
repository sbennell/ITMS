import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, CheckCircle, Loader, XCircle } from 'lucide-react';
import { api, StudentScriptsRun } from '../../lib/api';

// Runs the school's student account matcher scripts from the scripts folder, then imports the master list
export default function MasterListCard() {
  const queryClient = useQueryClient();
  const [folder, setFolder] = useState('');
  const [cardsFolder, setCardsFolder] = useState('');
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [run, setRun] = useState<StudentScriptsRun | null>(null);
  const [runError, setRunError] = useState<string | null>(null);

  const { data: status } = useQuery({
    queryKey: ['studentScriptsStatus'],
    queryFn: api.getStudentScriptsStatus
  });

  useEffect(() => {
    if (status) setFolder(status.folder);
  }, [status?.folder]);

  useEffect(() => {
    if (status) setCardsFolder(status.loginCardsFolder);
  }, [status?.loginCardsFolder]);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['studentScriptsStatus'] });

  const folderMutation = useMutation({
    mutationFn: (value: string) => api.updateSetting('studentScriptsFolder', value),
    onSuccess: refresh
  });

  const cardsFolderMutation = useMutation({
    mutationFn: (value: string) => api.updateSetting('loginCardsFolder', value.trim()),
    onSuccess: refresh
  });

  const importFileMutation = useMutation({
    mutationFn: (value: string) => api.updateSetting('studentImportFile', value),
    onSuccess: () => {
      refresh();
      queryClient.invalidateQueries({ queryKey: ['settings', 'studentImportFile'] });
      queryClient.invalidateQueries({ queryKey: ['studentImportHeaders'] });
    }
  });

  const uploadMutation = useMutation({
    mutationFn: ({ kind, file }: { kind: string; file: File }) => api.uploadStudentExport(kind, file),
    onMutate: () => setUploadError(null),
    onSuccess: refresh,
    onError: (error: Error) => setUploadError(error.message)
  });

  const runMutation = useMutation({
    mutationFn: api.runStudentScripts,
    onMutate: () => {
      setRun(null);
      setRunError(null);
    },
    onSuccess: (result) => {
      setRun(result);
      refresh();
      queryClient.invalidateQueries({ queryKey: ['students'] });
      queryClient.invalidateQueries({ queryKey: ['settings', 'studentLastImport'] });
    },
    onError: (error: Error) => setRunError(error.message)
  });

  if (!status) return null;
  const isDE = status.schoolType === 'DE';

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h3 className="text-lg font-semibold mb-4">Build Master List</h3>
      <p className="text-sm text-gray-600 mb-4">
        {isDE
          ? 'Runs Student_Account_Matcher.ps1 (DE) from the scripts folder, which matches Cases21 with eduPass accounts from STMC, then imports the master list. STMC credentials must be saved for the account the ITMS service runs as (Set-STMCCredential).'
          : 'Runs AD_Student_Export.ps1 and then Student_Account_Matcher.ps1 from the scripts folder, then imports the master list. A student with more than one active Google account is skipped and listed in the output.'}
      </p>

      <label className="block mb-4">
        <span className="text-sm font-medium text-gray-700">Scripts Folder</span>
        <div className="flex gap-2 mt-1">
          <input
            type="text"
            value={folder}
            onChange={(e) => setFolder(e.target.value)}
            placeholder="C:\ITMS\Scripts"
            className="input flex-1"
          />
          <button onClick={() => folderMutation.mutate(folder)} disabled={folderMutation.isPending} className="btn btn-primary">
            {folderMutation.isPending ? 'Saving...' : 'Save'}
          </button>
        </div>
      </label>

      <label className="block mb-4">
        <span className="text-sm font-medium text-gray-700">Login Cards Folder</span>
        <div className="flex gap-2 mt-1">
          <input
            type="text"
            value={cardsFolder}
            onChange={(e) => setCardsFolder(e.target.value)}
            placeholder="C:\ITMS\Login Cards"
            className="input flex-1"
          />
          <button onClick={() => cardsFolderMutation.mutate(cardsFolder)} disabled={cardsFolderMutation.isPending} className="btn btn-primary">
            {cardsFolderMutation.isPending ? 'Saving...' : 'Save'}
          </button>
        </div>
        <span className="text-xs text-gray-500">
          After each import, a login card PDF for each home group is saved here, replacing the last ones. Leave empty to not save them.
        </span>
      </label>

      {!status.folderExists && (
        <div className="mb-4 p-3 bg-red-50 rounded-lg border border-red-200 text-sm text-red-700">
          The folder {status.folder} was not found on the ITMS server.
        </div>
      )}

      {status.folderExists && !status.importsOutput && (
        <div className="mb-4 p-3 bg-amber-50 rounded-lg border border-amber-200 text-sm text-amber-800 flex items-center justify-between gap-4">
          <span>The student import file is not {status.outputFile}, so a run would not import the new list.</span>
          <button
            onClick={() => importFileMutation.mutate(status.outputFile)}
            disabled={importFileMutation.isPending}
            className="btn btn-secondary whitespace-nowrap"
          >
            Use This File
          </button>
        </div>
      )}

      {/* Exports */}
      <div className="space-y-3 mb-4">
        {status.exports.map((exp) => (
          <div key={exp.kind} className="border rounded-lg p-3">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-gray-900">{exp.label}</p>
                <p className="text-xs text-gray-500">
                  {exp.fileName ? `${exp.fileName}, uploaded ${new Date(exp.modified!).toLocaleString()}` : 'None uploaded'}
                </p>
              </div>
              <label className="btn btn-secondary cursor-pointer whitespace-nowrap">
                {uploadMutation.isPending && uploadMutation.variables?.kind === exp.kind ? 'Uploading...' : 'Upload CSV'}
                <input
                  type="file"
                  accept=".csv"
                  className="hidden"
                  disabled={uploadMutation.isPending || !status.folderExists}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) uploadMutation.mutate({ kind: exp.kind, file });
                    e.target.value = '';
                  }}
                />
              </label>
            </div>
          </div>
        ))}
      </div>

      {uploadError && (
        <div className="mb-4 p-3 bg-red-50 rounded-lg border border-red-200 text-sm text-red-700">{uploadError}</div>
      )}

      <p className="text-sm text-gray-600 mb-4">
        {status.lastRun ? `Last run: ${new Date(status.lastRun).toLocaleString()}` : 'Never run from ITMS'}
      </p>

      <button
        onClick={() => runMutation.mutate()}
        disabled={runMutation.isPending || !status.folderExists}
        className="btn btn-primary"
      >
        {runMutation.isPending ? (
          <>
            <Loader size={18} className="animate-spin mr-2" />
            Running... (this can take a few minutes)
          </>
        ) : (
          'Build Master List and Import'
        )}
      </button>

      {runError && (
        <div className="mt-4 p-3 bg-red-50 rounded-lg border border-red-200 text-sm text-red-700 flex gap-2">
          <AlertCircle size={18} className="shrink-0" />
          {runError}
        </div>
      )}

      {run && (
        <div className="mt-4 space-y-3">
          {run.steps.map((step) => (
            <details key={step.script} className="border rounded-lg" open={!step.ok}>
              <summary className={`px-3 py-2 text-sm font-medium cursor-pointer flex items-center gap-2 ${step.ok ? 'text-green-700' : 'text-red-700'}`}>
                {step.ok ? <CheckCircle size={16} /> : <XCircle size={16} />}
                {step.script}
              </summary>
              <pre className="px-3 pb-3 text-xs text-gray-700 whitespace-pre-wrap max-h-96 overflow-y-auto">{step.output.trim() || 'No output'}</pre>
            </details>
          ))}

          {run.message && (
            <div className={`p-3 rounded-lg text-sm ${run.ok ? 'bg-amber-50 border border-amber-200 text-amber-800' : 'bg-red-50 border border-red-200 text-red-700'}`}>
              {run.message}
            </div>
          )}

          {run.import && (
            <div className={`p-3 rounded-lg text-sm ${run.import.errors.length === 0 ? 'bg-green-50 border border-green-200 text-green-700' : 'bg-yellow-50 border border-yellow-200 text-yellow-800'}`}>
              <p className="font-medium">Imported: {run.import.created} created, {run.import.updated} updated</p>
              {run.import.errors.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {run.import.errors.slice(0, 10).map((err, i) => (
                    <li key={i}>{err.row > 0 ? `Row ${err.row}: ` : ''}{err.message}</li>
                  ))}
                  {run.import.errors.length > 10 && <li>... and {run.import.errors.length - 10} more</li>}
                </ul>
              )}
            </div>
          )}

          {run.loginCards && (
            <div className="p-3 rounded-lg text-sm bg-green-50 border border-green-200 text-green-700">
              Saved {run.loginCards.files.length} login card {run.loginCards.files.length === 1 ? 'PDF' : 'PDFs'} to {run.loginCards.folder}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
