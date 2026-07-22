import { useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Edit, Trash2, Printer, Eye, EyeOff, HelpCircle } from 'lucide-react';
import { api } from '../lib/api';
import {
  formatDate,
  formatCurrency,
  STATUS_LABELS,
  STATUS_COLORS,
  CONDITION_LABELS,
  CRITICALITY_LABELS,
  CRITICALITY_COLORS,
  DATA_CLASSIFICATION_LABELS,
  HOSTING_LABELS,
  SUPPORT_LABELS,
  cn
} from '../lib/utils';
import LabelPreviewModal from '../components/LabelPreviewModal';
import PasswordPromptModal from '../components/PasswordPromptModal';
import { useAuth } from '../App';

export default function AssetDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { hasPermission } = useAuth();
  const [showLabelModal, setShowLabelModal] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showPasswordPrompt, setShowPasswordPrompt] = useState(false);

  const { data: asset, isLoading, error } = useQuery({
    queryKey: ['asset', id],
    queryFn: () => api.getAsset(id!),
    enabled: !!id
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.deleteAsset(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assets'] });
      navigate('/assets');
    }
  });

  const handleDelete = () => {
    if (window.confirm('Are you sure you want to delete this asset? This action cannot be undone.')) {
      deleteMutation.mutate();
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (error || !asset) {
    return (
      <div className="text-center py-12">
        <p className="text-red-600">Asset not found or failed to load.</p>
        <Link to="/assets" className="btn btn-secondary mt-4">
          Back to Assets
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link to="/assets" className="p-2 rounded-md hover:bg-gray-100">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{asset.itemNumber}</h1>
            <p className="text-sm text-gray-500">
              {asset.manufacturer?.name} {asset.model}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowLabelModal(true)}
            className="btn btn-secondary"
          >
            <Printer className="w-4 h-4 mr-2" />
            Print Label
          </button>
          <Link to={`/assets/${id}/edit`} className="btn btn-secondary">
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
        <span className={cn('px-3 py-1 text-sm font-medium rounded-full', STATUS_COLORS[asset.status])}>
          {STATUS_LABELS[asset.status] || asset.status}
        </span>
        <span className="ml-3 text-sm text-gray-500">
          Condition: {CONDITION_LABELS[asset.condition] || asset.condition}
        </span>
      </div>

      {/* Details Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Basic Info */}
        <div className="card p-6">
          <h2 className="text-lg font-semibold mb-4">Basic Information</h2>
          <dl className="space-y-3">
            <DetailRow label="Item Number" value={asset.itemNumber} help="Unique identifier for this asset, used on printed labels, QR codes, and in the asset register export." />
            <DetailRow label="Serial Number" value={asset.serialNumber} help="The manufacturer-assigned serial number, usually printed on a sticker on the device." />
            <DetailRow label="Manufacturer" value={asset.manufacturer?.name} help="The company that made this asset." />
            <DetailRow label="Model" value={asset.model} help="The manufacturer's model name or number." />
            <DetailRow label="Category" value={asset.category?.name} help="The type of asset (e.g. Laptop, Desktop, Server). Also used as the asset's Type in the MACS asset register export." />
            <DetailRow label="Description" value={asset.description} help="Free-text description of the asset." />
          </dl>
        </div>

        {/* Assignment & Location */}
        <div className="card p-6">
          <h2 className="text-lg font-semibold mb-4">Assignment & Location</h2>
          <dl className="space-y-3">
            <div className="flex justify-between">
              <dt className="text-sm font-medium text-gray-500 inline-flex items-center gap-1">
                Assigned To
                <span title="The student or staff member currently using this asset.">
                  <HelpCircle className="w-3.5 h-3.5 text-gray-400 cursor-help" />
                </span>
              </dt>
              <dd className="text-sm text-gray-900">
                {asset.studentId && asset.student ? (
                  <Link
                    to={`/students/${asset.student.id}`}
                    className="text-primary-600 hover:text-primary-800 font-medium"
                  >
                    {asset.student.prefName || asset.student.firstName} {asset.student.surname}
                  </Link>
                ) : (
                  asset.assignedTo || '-'
                )}
              </dd>
            </div>
            <DetailRow label="Location" value={asset.location?.name} help="Where the asset is physically located." />
          </dl>
        </div>

        {/* Device Details */}
        <div className="card p-6">
          <h2 className="text-lg font-semibold mb-4">Device Details</h2>
          <dl className="space-y-3">
            <DetailRow label="Hostname" value={asset.hostname} help="The device's network hostname." />

            {/* IP Addresses Section */}
            <div>
              <dt className="text-sm font-medium text-gray-500 inline-flex items-center gap-1">
                IP Addresses
                <span title="IP addresses currently linked to this device.">
                  <HelpCircle className="w-3.5 h-3.5 text-gray-400 cursor-help" />
                </span>
              </dt>
              <dd className="mt-1">
                {asset.ipAddresses && asset.ipAddresses.length > 0 ? (
                  <div className="space-y-1">
                    {asset.ipAddresses.map((ipEntry) => (
                      <div key={ipEntry.id} className="flex items-center gap-2">
                        <span className="text-sm font-mono text-gray-900">{ipEntry.ip}</span>
                        {ipEntry.label && <span className="text-xs text-gray-600">({ipEntry.label})</span>}
                      </div>
                    ))}
                  </div>
                ) : (
                  <span className="text-sm text-gray-600">-</span>
                )}
              </dd>
            </div>
            <DetailRow label="LAN MAC Address" value={asset.lanMacAddress} help="The MAC address of the device's wired network adapter." />
            <DetailRow label="WLAN MAC Address" value={asset.wlanMacAddress} help="The MAC address of the device's wireless network adapter." />
            <DetailRow label="Username" value={asset.deviceUsername} help="The login username for this device." />
            <div className="flex justify-between">
              <dt className="text-sm font-medium text-gray-500 inline-flex items-center gap-1">
                Password
                <span title="The login password for this device. Only visible to users with password-view permission.">
                  <HelpCircle className="w-3.5 h-3.5 text-gray-400 cursor-help" />
                </span>
              </dt>
              <dd className="text-sm text-gray-900 flex items-center gap-2">
                {!hasPermission('canViewDevicePasswords') ? (
                  <span className="text-gray-400 italic">Hidden</span>
                ) : asset.devicePassword ? (
                  <>
                    <span>{showPassword ? asset.devicePassword : '********'}</span>
                    <button
                      onClick={() => {
                        if (showPassword) {
                          setShowPassword(false);
                        } else {
                          setShowPasswordPrompt(true);
                        }
                      }}
                      className="p-1 hover:bg-gray-100 rounded text-gray-500 hover:text-gray-700"
                      title={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </>
                ) : (
                  <span>-</span>
                )}
              </dd>
            </div>
          </dl>
        </div>

        {/* Purchase Info */}
        <div className="card p-6">
          <h2 className="text-lg font-semibold mb-4">Purchase Information</h2>
          <dl className="space-y-3">
            <DetailRow label="Acquired Date" value={formatDate(asset.acquiredDate)} help="The date this asset was purchased or received." />
            <DetailRow label="Purchase Price" value={formatCurrency(asset.purchasePrice)} help="What the school paid for this asset." />
            <DetailRow label="Supplier" value={asset.supplier?.name} help="The vendor this asset was purchased from." />
            <DetailRow label="Order Number" value={asset.orderNumber} help="The purchase order or invoice reference number." />
          </dl>
        </div>

        {/* Lifecycle */}
        <div className="card p-6">
          <h2 className="text-lg font-semibold mb-4">Lifecycle</h2>
          <dl className="space-y-3">
            <DetailRow label="Warranty Expiration" value={formatDate(asset.warrantyExpiration)} help="The date the manufacturer's warranty ends." />
            <DetailRow label="End of Life Date" value={formatDate(asset.endOfLifeDate)} help="The date the manufacturer stops supporting or patching this asset." />
            <DetailRow label="Last Review Date" value={formatDate(asset.lastReviewDate)} help="The date this asset's record was last reviewed for accuracy. Update at least yearly to meet the MACS annual review requirement." />
            <DetailRow label="Decommission Date" value={formatDate(asset.decommissionDate)} help="The date the asset was, or is planned to be, retired from service." />
          </dl>
        </div>

        {/* Compliance / Governance */}
        <div className="card p-6">
          <h2 className="text-lg font-semibold mb-4">Compliance / Governance</h2>
          <dl className="space-y-3">
            <DetailRow label="Business Purpose / Function" value={asset.businessPurpose} help="The business process or service this asset supports." />
            <DetailRow label="Business Owner" value={asset.businessOwner} help="The person or role accountable for this asset's business use (e.g. Principal, Business Manager)." />
            <DetailRow label="Technical Owner" value={asset.technicalOwner} help="The person or role responsible for this asset's technical upkeep (e.g. IT Coordinator)." />
            <DetailRow label="Version" value={asset.version} help="The software or firmware version currently installed, if applicable." />
            <div className="flex justify-between">
              <dt className="text-sm font-medium text-gray-500 inline-flex items-center gap-1">
                Criticality
                <span title="How severe the impact would be if this asset were compromised or unavailable. Crown Jewel means critical to core school operations or child safety.">
                  <HelpCircle className="w-3.5 h-3.5 text-gray-400 cursor-help" />
                </span>
              </dt>
              <dd className="text-sm text-gray-900">
                {asset.criticalityTier ? (
                  <span className={cn('px-2 py-0.5 text-xs font-medium rounded-full', CRITICALITY_COLORS[asset.criticalityTier])}>
                    {CRITICALITY_LABELS[asset.criticalityTier] || asset.criticalityTier}
                  </span>
                ) : '-'}
              </dd>
            </div>
            <DetailRow label="Data Classification" value={asset.dataClassification ? (DATA_CLASSIFICATION_LABELS[asset.dataClassification] || asset.dataClassification) : null} help="The sensitivity of the most sensitive data this asset stores or processes." />
            <DetailRow label="Hosting" value={asset.hostingType ? (HOSTING_LABELS[asset.hostingType] || asset.hostingType) : null} help="Where this asset (or the data/service it provides) is hosted." />
            <DetailRow label="Support Type" value={asset.supportType ? (SUPPORT_LABELS[asset.supportType] || asset.supportType) : null} help="Who provides technical support for this asset." />
            <DetailRow label="Internet Facing" value={asset.internetFacing === null || asset.internetFacing === undefined ? 'Unknown' : (asset.internetFacing ? 'Yes' : 'No')} help="Whether this asset is directly accessible from the internet." />
          </dl>
        </div>

        {/* Comments */}
        <div className="card p-6">
          <h2 className="text-lg font-semibold mb-4">Comments / Supporting Notes</h2>
          <p className="text-sm text-gray-700 whitespace-pre-wrap">
            {asset.comments || 'No comments'}
          </p>
        </div>
      </div>

      {/* Metadata */}
      <div className="card p-6">
        <h2 className="text-lg font-semibold mb-4">Record Information</h2>
        <dl className="flex flex-wrap gap-6">
          <DetailRow label="Created" value={formatDate(asset.createdAt)} inline />
          <DetailRow label="Last Updated" value={formatDate(asset.updatedAt)} inline />
          {(asset as any).auditLogs?.[0]?.user && (
            <DetailRow
              label="Last Edited By"
              value={(asset as any).auditLogs[0].user.fullName}
              inline
            />
          )}
        </dl>

        {/* Recent Edit History */}
        {(asset as any).auditLogs?.length > 0 && (
          <div className="mt-6">
            <h3 className="text-sm font-medium text-gray-700 mb-3">Recent Changes</h3>
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {(asset as any).auditLogs
                .filter((log: any) => log.action !== 'PRINT_LABEL')
                .slice(0, 10)
                .map((log: any) => {
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
                          log.action === 'UPDATE' || log.action === 'BULK_UPDATE' ? 'bg-blue-100 text-blue-800' :
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
                    {(log.action === 'UPDATE' || log.action === 'BULK_UPDATE') && changedFields.length > 0 && (
                      <div className="mt-2 pl-4 text-xs text-gray-600 space-y-1">
                        {changedFields.slice(0, 5).map(field => {
                          let before = changes.before[field];
                          let after = changes.after[field];
                          // Format field label: remove 'Id' suffix and add spaces before capitals
                          let fieldLabel = field.replace(/Id$/, '').replace(/([A-Z])/g, ' $1').trim();
                          fieldLabel = fieldLabel.replace(/^./, str => str.toUpperCase());

                          // Mask sensitive fields
                          const isSensitive = ['devicePassword'].includes(field);
                          if (isSensitive) {
                            before = before && before !== '(empty)' ? '••••••••••' : before;
                            after = after && after !== '(empty)' ? '••••••••••' : after;
                          }

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

      {/* Label Print Modal */}
      {showLabelModal && asset && (
        <LabelPreviewModal
          asset={asset}
          onClose={() => setShowLabelModal(false)}
        />
      )}

      {/* Password Prompt Modal */}
      {showPasswordPrompt && (
        <PasswordPromptModal
          onSuccess={() => {
            setShowPasswordPrompt(false);
            setShowPassword(true);
          }}
          onClose={() => setShowPasswordPrompt(false)}
        />
      )}
    </div>
  );
}

function DetailRow({
  label,
  value,
  help,
  inline = false
}: {
  label: string;
  value: string | null | undefined;
  help?: string;
  inline?: boolean;
}) {
  if (inline) {
    return (
      <div>
        <dt className="text-xs font-medium text-gray-500 inline-flex items-center gap-1">
          {label}
          {help && (
            <span title={help}>
              <HelpCircle className="w-3 h-3 text-gray-400 cursor-help" />
            </span>
          )}
        </dt>
        <dd className="text-sm text-gray-900">{value || '-'}</dd>
      </div>
    );
  }

  return (
    <div className="flex justify-between">
      <dt className="text-sm font-medium text-gray-500 inline-flex items-center gap-1">
        {label}
        {help && (
          <span title={help}>
            <HelpCircle className="w-3.5 h-3.5 text-gray-400 cursor-help" />
          </span>
        )}
      </dt>
      <dd className="text-sm text-gray-900">{value || '-'}</dd>
    </div>
  );
}
