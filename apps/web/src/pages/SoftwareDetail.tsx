import { useRef, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Edit, Trash2, Download, FileText } from 'lucide-react';
import { api } from '../lib/api';
import {
  formatDate,
  SOFTWARE_STATUS_LABELS,
  SOFTWARE_STATUS_COLORS,
  CRITICALITY_LABELS,
  CRITICALITY_COLORS,
  DATA_CLASSIFICATION_LABELS,
  HOSTING_LABELS,
  SUPPORT_LABELS,
  cn
} from '../lib/utils';

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function SoftwareDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadError, setUploadError] = useState('');

  const { data: software, isLoading, error } = useQuery({
    queryKey: ['software', id],
    queryFn: () => api.getSoftware(id!),
    enabled: !!id
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.deleteSoftware(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['software'] });
      navigate('/software');
    }
  });

  const uploadMutation = useMutation({
    mutationFn: (file: File) => api.uploadSoftwareAttachment(id!, file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['software', id] });
      setUploadError('');
      if (fileInputRef.current) fileInputRef.current.value = '';
    },
    onError: (err: Error) => setUploadError(err.message)
  });

  const deleteAttachmentMutation = useMutation({
    mutationFn: (attachmentId: string) => api.deleteSoftwareAttachment(id!, attachmentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['software', id] });
    }
  });

  const handleDelete = () => {
    if (window.confirm('Are you sure you want to delete this software item? This action cannot be undone.')) {
      deleteMutation.mutate();
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      uploadMutation.mutate(file);
    }
  };

  const handleDeleteAttachment = (attachmentId: string, name: string) => {
    if (window.confirm(`Remove attachment "${name}"?`)) {
      deleteAttachmentMutation.mutate(attachmentId);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (error || !software) {
    return (
      <div className="text-center py-12">
        <p className="text-red-600">Software not found or failed to load.</p>
        <Link to="/software" className="btn btn-secondary mt-4">
          Back to Software
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link to="/software" className="p-2 rounded-md hover:bg-gray-100">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{software.itemNumber} - {software.name}</h1>
            <p className="text-sm text-gray-500">
              {software.publisher?.name} {software.version}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Link to={`/software/${id}/edit`} className="btn btn-secondary">
            <Edit className="w-4 h-4 mr-2" />
            Edit
          </Link>
          <button
            onClick={handleDelete}
            disabled={deleteMutation.isPending}
            className="btn btn-danger"
          >
            <Trash2 className="w-4 h-4 mr-2" />
            Delete
          </button>
        </div>
      </div>

      {/* Status badge */}
      <div>
        <span className={cn('px-3 py-1 text-sm font-medium rounded-full', SOFTWARE_STATUS_COLORS[software.status])}>
          {SOFTWARE_STATUS_LABELS[software.status] || software.status}
        </span>
      </div>

      {/* Details Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Basic Info */}
        <div className="card p-6">
          <h2 className="text-lg font-semibold mb-4">Basic Information</h2>
          <dl className="space-y-3">
            <DetailRow label="Item Number" value={software.itemNumber} />
            <DetailRow label="Name" value={software.name} />
            <DetailRow label="Publisher" value={software.publisher?.name} />
            <DetailRow label="Category" value={software.category?.name} />
            <DetailRow label="Description" value={software.description} />
            <DetailRow label="Version" value={software.version} />
            <DetailRow label="URL" value={software.url} />
            <DetailRow label="App Store" value={software.appStore} />
          </dl>
        </div>

        {/* Ownership & Purpose */}
        <div className="card p-6">
          <h2 className="text-lg font-semibold mb-4">Ownership & Purpose</h2>
          <dl className="space-y-3">
            <DetailRow label="Business Purpose" value={software.businessPurpose} />
            <DetailRow label="Business Owner" value={software.businessOwner} />
            <DetailRow label="Technical Owner" value={software.technicalOwner} />
          </dl>
        </div>

        {/* Licensing & Deployment */}
        <div className="card p-6">
          <h2 className="text-lg font-semibold mb-4">Licensing & Deployment</h2>
          <dl className="space-y-3">
            <DetailRow label="Deployment Mechanism" value={software.deploymentMechanism} />
            <DetailRow label="Initial Install Date" value={formatDate(software.initialInstallDate)} />
            <DetailRow label="License Expiration" value={formatDate(software.licenseExpiration)} />
            <DetailRow label="License Count" value={software.licenseCount?.toString() || null} />
            <DetailRow label="Supplier" value={software.supplier?.name} />
            <DetailRow label="Last Review Date" value={formatDate(software.lastReviewDate)} />
            <DetailRow label="Decommission Date" value={formatDate(software.decommissionDate)} />
          </dl>
        </div>

        {/* Compliance / Governance */}
        <div className="card p-6">
          <h2 className="text-lg font-semibold mb-4">Compliance / Governance</h2>
          <dl className="space-y-3">
            <div className="flex justify-between">
              <dt className="text-sm font-medium text-gray-500">Criticality</dt>
              <dd className="text-sm text-gray-900">
                {software.criticalityTier ? (
                  <span className={cn('px-2 py-0.5 text-xs font-medium rounded-full', CRITICALITY_COLORS[software.criticalityTier])}>
                    {CRITICALITY_LABELS[software.criticalityTier] || software.criticalityTier}
                  </span>
                ) : '-'}
              </dd>
            </div>
            <DetailRow label="Data Classification" value={software.dataClassification ? (DATA_CLASSIFICATION_LABELS[software.dataClassification] || software.dataClassification) : null} />
            <DetailRow label="Hosting" value={software.hostingType ? (HOSTING_LABELS[software.hostingType] || software.hostingType) : null} />
            <DetailRow label="Support Type" value={software.supportType ? (SUPPORT_LABELS[software.supportType] || software.supportType) : null} />
            <DetailRow label="Internet Facing" value={software.internetFacing === null || software.internetFacing === undefined ? 'Unknown' : (software.internetFacing ? 'Yes' : 'No')} />
          </dl>
        </div>

        {/* Attachments */}
        <div className="card p-6">
          <h2 className="text-lg font-semibold mb-4">Attachments</h2>

          <div className="mb-4">
            <input
              ref={fileInputRef}
              type="file"
              onChange={handleFileSelect}
              disabled={uploadMutation.isPending}
              className="block w-full text-sm text-gray-600 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-primary-50 file:text-primary-700 hover:file:bg-primary-100"
            />
            <p className="mt-1 text-xs text-gray-500">PDF, Word, Excel, PNG, or JPEG - up to 10MB</p>
            {uploadMutation.isPending && <p className="mt-1 text-xs text-gray-500">Uploading...</p>}
            {uploadError && <p className="mt-1 text-sm text-red-600">{uploadError}</p>}
          </div>

          {software.attachments && software.attachments.length > 0 ? (
            <ul className="divide-y divide-gray-200">
              {software.attachments.map((attachment) => (
                <li key={attachment.id} className="flex items-center justify-between py-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <FileText className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{attachment.originalName}</p>
                      <p className="text-xs text-gray-500">{formatFileSize(attachment.size)} - {formatDate(attachment.createdAt)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <a
                      href={api.getSoftwareAttachmentDownloadUrl(id!, attachment.id)}
                      className="p-1 text-gray-400 hover:text-primary-600"
                      title="Download"
                    >
                      <Download className="w-4 h-4" />
                    </a>
                    <button
                      onClick={() => handleDeleteAttachment(attachment.id, attachment.originalName)}
                      className="p-1 text-gray-400 hover:text-red-600"
                      title="Remove"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-gray-500">No attachments yet.</p>
          )}
        </div>

        {/* Comments */}
        <div className="card p-6">
          <h2 className="text-lg font-semibold mb-4">Comments / Supporting Notes</h2>
          <p className="text-sm text-gray-700 whitespace-pre-wrap">
            {software.comments || 'No comments'}
          </p>
        </div>
      </div>

      {/* Metadata */}
      <div className="card p-6">
        <h2 className="text-lg font-semibold mb-4">Record Information</h2>
        <dl className="flex flex-wrap gap-6">
          <DetailRow label="Created" value={formatDate(software.createdAt)} inline />
          <DetailRow label="Last Updated" value={formatDate(software.updatedAt)} inline />
          {(software as any).auditLogs?.[0]?.user && (
            <DetailRow
              label="Last Edited By"
              value={(software as any).auditLogs[0].user.fullName}
              inline
            />
          )}
        </dl>

        {/* Recent Edit History */}
        {(software as any).auditLogs?.length > 0 && (
          <div className="mt-6">
            <h3 className="text-sm font-medium text-gray-700 mb-3">Recent Changes</h3>
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {(software as any).auditLogs.slice(0, 10).map((log: any) => {
                const changes = log.changes ? JSON.parse(log.changes) : null;
                const changedFields = changes?.before && changes?.after
                  ? Object.keys(changes.after).filter(key => {
                      const before = changes.before[key];
                      const after = changes.after[key];
                      return JSON.stringify(before) !== JSON.stringify(after) && after !== undefined;
                    })
                  : [];

                return (
                  <div
                    key={log.id}
                    className="text-sm py-2 border-b border-gray-100 last:border-0"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                          log.action === 'CREATE' ? 'bg-green-100 text-green-800' :
                          log.action === 'UPDATE' ? 'bg-blue-100 text-blue-800' :
                          log.action === 'ATTACHMENT_ADDED' ? 'bg-teal-100 text-teal-800' :
                          log.action === 'ATTACHMENT_REMOVED' ? 'bg-orange-100 text-orange-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {log.action}
                        </span>
                        <span className="text-gray-600">
                          {log.user?.fullName || 'Unknown'}
                        </span>
                      </div>
                      <span className="text-gray-500 text-xs">
                        {new Date(log.timestamp).toLocaleString()}
                      </span>
                    </div>
                    {log.action === 'UPDATE' && changedFields.length > 0 && (
                      <div className="mt-2 pl-4 text-xs text-gray-600 space-y-1">
                        {changedFields.slice(0, 5).map(field => {
                          const before = changes.before[field];
                          const after = changes.after[field];
                          let fieldLabel = field.replace(/Id$/, '').replace(/([A-Z])/g, ' $1').trim();
                          fieldLabel = fieldLabel.replace(/^./, str => str.toUpperCase());

                          return (
                            <div key={field} className="flex gap-1">
                              <span className="font-medium">{fieldLabel}:</span>
                              <span className="text-gray-400">{before || '(empty)'}</span>
                              <span className="text-gray-400">→</span>
                              <span className="text-gray-700">{after || '(empty)'}</span>
                            </div>
                          );
                        })}
                        {changedFields.length > 5 && (
                          <div className="text-gray-400">+{changedFields.length - 5} more fields</div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function DetailRow({
  label,
  value,
  inline = false
}: {
  label: string;
  value: string | null | undefined;
  inline?: boolean;
}) {
  if (inline) {
    return (
      <div>
        <dt className="text-xs font-medium text-gray-500">{label}</dt>
        <dd className="text-sm text-gray-900">{value || '-'}</dd>
      </div>
    );
  }

  return (
    <div className="flex justify-between">
      <dt className="text-sm font-medium text-gray-500">{label}</dt>
      <dd className="text-sm text-gray-900">{value || '-'}</dd>
    </div>
  );
}
