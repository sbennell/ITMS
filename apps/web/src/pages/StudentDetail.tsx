import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, ArrowLeft, CheckCircle, Download, RefreshCw, Wrench, XCircle } from 'lucide-react';
import { api, HomeFolderStatus } from '../lib/api';
import { useAuth } from '../App';

export default function StudentDetail() {
  const { id } = useParams<{ id: string }>();
  const { hasPermission } = useAuth();

  const { data: student, isLoading, error } = useQuery({
    queryKey: ['student', id],
    queryFn: () => id ? api.getStudent(id) : Promise.reject('No ID'),
    enabled: !!id
  });

  const { data: adStatus, isFetching: adChecking, refetch: recheckAd } = useStudentAdStatus(id);

  const { data: schoolType } = useQuery({
    queryKey: ['settings', 'schoolType'],
    queryFn: () => api.getSetting('schoolType').catch(() => ({ key: 'schoolType', value: 'STANDARD' }))
  });

  const isDESchool = schoolType?.value === 'DE';

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  if (error || !student) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-red-500">
          Error loading student: {(error as Error)?.message || 'Not found'}
        </div>
      </div>
    );
  }

  const fullName = `${student.firstName} ${student.surname}`;

  const handleDownloadLoginCard = () => {
    const url = api.getStudentLoginCardsUrl({ studentId: student.id });
    window.open(url, '_blank');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <Link
            to="/students"
            className="text-primary-600 hover:text-primary-800"
          >
            <ArrowLeft size={24} />
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">{fullName}</h1>
            <p className="mt-1 text-sm text-gray-500">
              {student.status} • Year {student.schoolYear || '-'}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          {adStatus?.enabled && (
            <button onClick={() => recheckAd()} disabled={adChecking} className="btn btn-secondary flex items-center gap-2">
              <RefreshCw size={18} className={adChecking ? 'animate-spin' : ''} />
              {adChecking ? 'Checking...' : 'Check Again'}
            </button>
          )}
          {hasPermission('canViewStudentPasswords') && (
            <button
              onClick={handleDownloadLoginCard}
              className="btn btn-secondary flex items-center gap-2"
            >
              <Download size={18} />
              Login Card
            </button>
          )}
        </div>
      </div>

      {/* Info Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Personal Information */}
        <div className="bg-white rounded-lg shadow p-6 space-y-4">
          <h2 className="text-lg font-bold text-gray-900 border-b pb-3">Personal Information</h2>
          <DetailRow label="First Name" value={student.firstName} />
          <DetailRow label="Surname" value={student.surname} />
          <DetailRow label="Home Group" value={student.homeGroup || '-'} />
          <DetailRow label="School Year" value={student.schoolYear || '-'} />
          <DetailRow label="Status" value={student.status || 'Active'} />
          <DetailRow
            label="Date of Birth"
            value={
              student.birthdate
                ? new Date(student.birthdate).toLocaleDateString()
                : '-'
            }
          />
        </div>

        {/* Account Details */}
        <div className="bg-white rounded-lg shadow p-6 space-y-4">
          <h2 className="text-lg font-bold text-gray-900 border-b pb-3">Account Details</h2>
          <DetailRow label="Username" value={student.username || '-'} />
          {isDESchool && (
            <DetailRow label="EduPass Username" value={student.edupassUsername || '-'} />
          )}
          <DetailRow label="Email" value={student.email || '-'} />
          <DetailRow label="Password" value={hasPermission('canViewStudentPasswords') ? (student.password || '-') : 'Hidden'} />
          <AdAccountSection studentId={student.id} />
        </div>
      </div>

      <StudentAdCards studentId={student.id} />

      {/* Assigned Assets */}
      {student.assets && student.assets.length > 0 && (
        <div className="bg-white rounded-lg shadow p-6 space-y-4">
          <h2 className="text-lg font-bold text-gray-900 border-b pb-3">Assigned Assets</h2>
          <div className="overflow-x-auto rounded border border-gray-200">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-gray-700">Item #</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-700">Make</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-700">Model</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-700">S/N</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-700">Category</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-700">Status</th>
                </tr>
              </thead>
              <tbody>
                {student.assets.map((asset) => (
                  <tr key={asset.id} className="border-b hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <Link
                        to={`/assets/${asset.id}`}
                        className="text-primary-600 hover:text-primary-800 font-medium"
                      >
                        {asset.itemNumber}
                      </Link>
                    </td>
                    <td className="px-4 py-3">{asset.manufacturer?.name || '-'}</td>
                    <td className="px-4 py-3">{asset.model || '-'}</td>
                    <td className="px-4 py-3">{asset.serialNumber || '-'}</td>
                    <td className="px-4 py-3">{asset.category?.name || '-'}</td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-800">
                        {asset.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {(!student.assets || student.assets.length === 0) && (
        <div className="bg-white rounded-lg shadow p-6 text-center text-gray-500">
          No assets assigned to this student
        </div>
      )}
    </div>
  );
}

// The page header and the cards share this check. It runs PowerShell, so it takes a few seconds.
function useStudentAdStatus(studentId: string | undefined) {
  return useQuery({
    queryKey: ['studentAdStatus', studentId],
    queryFn: () => api.getStudentAdStatus(studentId!),
    enabled: !!studentId,
    staleTime: 1000 * 60 * 5,
    retry: false
  });
}

// The AD account section of Account Details. Shown only when AD Sync is enabled
function AdAccountSection({ studentId }: { studentId: string }) {
  const { data, error, isFetching } = useStudentAdStatus(studentId);

  if (data && !data.enabled) return null;

  const account = data?.account;

  return (
    <div className="space-y-4">
      {isFetching && !data && <p className="text-sm text-gray-500">Checking Active Directory...</p>}

      {error && !isFetching && (
        <p className="text-sm text-red-700 flex gap-2">
          <AlertCircle size={18} className="shrink-0" />
          {(error as Error).message}
        </p>
      )}

      {account && !account.exists && (
        <p className="text-sm text-red-700">No AD account was found for this username.</p>
      )}

      {account?.exists && (
        <>
          <StatusRow label="Enabled" ok={account.enabled} />
          <DetailRow label="OU" value={account.ou} />
          <div>
            <dt className="text-sm font-medium text-gray-600 mb-2">Member of ({account.groups.length})</dt>
            {account.groups.length === 0 ? (
              <p className="text-sm text-gray-500">No groups apart from the primary group</p>
            ) : (
              <ul className="flex flex-wrap gap-2">
                {account.groups.map((group) => (
                  <li key={group} className="px-2 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-800">{group}</li>
                ))}
              </ul>
            )}
          </div>
          {account.missingGroups.length > 0 && (
            <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3">
              Not in: {account.missingGroups.join(', ')}. Apply in Settings, AD Sync adds these.
            </p>
          )}
        </>
      )}
    </div>
  );
}

// Folder cards. Shown only when AD Sync is enabled
function StudentAdCards({ studentId }: { studentId: string }) {
  const { isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const { data, error, isFetching } = useStudentAdStatus(studentId);
  // The card whose Fix was clicked shows the result
  const [fixedCard, setFixedCard] = useState<string | null>(null);

  // The fix returns the student as checked afterwards, so it replaces the last check
  const fixMutation = useMutation({
    mutationFn: () => api.fixStudentHomeFolder(studentId),
    onSuccess: (result) => queryClient.setQueryData(['studentAdStatus', studentId], result)
  });

  // A new check replaces the result of the last fix
  const { reset: resetFix } = fixMutation;
  useEffect(() => {
    if (isFetching) resetFix();
  }, [isFetching, resetFix]);

  if (data && !data.enabled) return null;

  const folder = data?.folder;
  const busy = isFetching || fixMutation.isPending;

  // While the first check runs, a placeholder Home Folder card shows the progress
  const cards = [
    { key: 'home', title: 'Home Folder', status: folder },
    { key: 'secondary', title: 'Secondary Folder', status: data?.secondaryFolder }
  ].filter(({ key, status }) => status || (key === 'home' && !data && !error));

  if (cards.length === 0) return null;

  const handleFix = (card: string) => {
    if (window.confirm('Fix this student\'s folders? Missing folders are created, the home folder is moved to the right place and connected on the account profile, and permissions are reset, removing access for anyone else.')) {
      setFixedCard(card);
      fixMutation.mutate();
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Folders, when AD Sync manages them. One Fix fixes both. */}
      {cards.map(({ key, title, status }) => (
        <FolderCard
          key={key}
          title={title}
          folder={status}
          // Only a home folder is looked for elsewhere, so only it can be in the wrong place
          showPlacement={key === 'home'}
          loading={isFetching && !data}
          canFix={isAdmin}
          busy={busy}
          fixing={fixMutation.isPending && fixedCard === key}
          onFix={() => handleFix(key)}
          fixError={fixedCard === key ? (fixMutation.error as Error | null) : null}
          fixSteps={fixedCard === key && fixMutation.isSuccess ? fixMutation.data.steps ?? [] : null}
        />
      ))}
    </div>
  );
}

function FolderCard({ title, folder, showPlacement, loading, canFix, busy, fixing, onFix, fixError, fixSteps }: {
  title: string;
  folder: HomeFolderStatus | null | undefined;
  showPlacement: boolean;
  loading: boolean;
  canFix: boolean;
  busy: boolean;
  fixing: boolean;
  onFix: () => void;
  fixError: Error | null;
  fixSteps: string[] | null;
}) {
  const problems = folder?.problems ?? [];

  return (
    <div className="bg-white rounded-lg shadow p-6 space-y-4">
      <div className="flex items-center justify-between border-b pb-3">
        <h2 className="text-lg font-bold text-gray-900">{title}</h2>
        {canFix && problems.length > 0 && (
          <button onClick={onFix} disabled={busy} className="btn btn-primary flex items-center gap-2">
            <Wrench size={16} />
            {fixing ? 'Fixing...' : 'Fix'}
          </button>
        )}
      </div>

      {loading && <p className="text-sm text-gray-500">Checking the folder...</p>}

      {fixError && (
        <p className="text-sm text-red-700 flex gap-2">
          <AlertCircle size={18} className="shrink-0" />
          {fixError.message}
        </p>
      )}

      {fixSteps && (
        <div className="text-sm text-green-800 bg-green-50 border border-green-200 rounded-lg p-3">
          <p className="font-medium">Fixed</p>
          <ul className="mt-1 space-y-0.5">
            {fixSteps.map((step, i) => <li key={i}>{step}</li>)}
          </ul>
        </div>
      )}

      {folder && (
        <>
          <DetailRow label="Folder" value={folder.path || folder.expectedPath} />
          <StatusRow label="Folder exists" ok={folder.exists} />
          {folder.exists && showPlacement && <StatusRow label="In the right place" ok={folder.inRightPlace} />}
          {folder.exists && <StatusRow label="Permissions correct" ok={folder.permissionsOk} />}
          {folder.profileOk != null && <StatusRow label="Connected on the account profile" ok={folder.profileOk} />}
          {problems.length > 0 && (
            <ul className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-1">
              {problems.map((problem, i) => <li key={i}>{problem}</li>)}
            </ul>
          )}
          {problems.length > 0 && !canFix && (
            <p className="text-sm text-gray-500">An administrator can fix these from this page.</p>
          )}
        </>
      )}
    </div>
  );
}

function StatusRow({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className="flex justify-between">
      <dt className="text-sm font-medium text-gray-600">{label}</dt>
      <dd className={`text-sm font-medium flex items-center gap-1 ${ok ? 'text-green-700' : 'text-red-700'}`}>
        {ok ? <CheckCircle size={16} /> : <XCircle size={16} />}
        {ok ? 'Yes' : 'No'}
      </dd>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex justify-between">
      <dt className="text-sm font-medium text-gray-600">{label}</dt>
      <dd className="text-sm text-gray-900 font-medium">{value || '-'}</dd>
    </div>
  );
}
