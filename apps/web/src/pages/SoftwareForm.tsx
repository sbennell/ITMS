import { useEffect } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { ArrowLeft, Save } from 'lucide-react';
import { api, Software } from '../lib/api';
import {
  SOFTWARE_STATUS_LABELS,
  CRITICALITY_LABELS,
  DATA_CLASSIFICATION_LABELS,
  HOSTING_LABELS,
  SUPPORT_LABELS
} from '../lib/utils';
import FieldLabel from '../components/FieldLabel';

type SoftwareFormData = {
  itemNumber: string;
  name: string;
  publisherId: string;
  categoryId: string;
  description: string;
  version: string;
  url: string;
  appStore: string;
  deploymentMechanism: string;
  status: string;
  businessPurpose: string;
  businessOwner: string;
  technicalOwner: string;
  initialInstallDate: string;
  licenseExpiration: string;
  licenseCount: string;
  supplierId: string;
  lastReviewDate: string;
  decommissionDate: string;
  comments: string;
  criticalityTier: string;
  dataClassification: string;
  hostingType: string;
  supportType: string;
  internetFacing: string;
};

export default function SoftwareForm() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isEditing = !!id;

  const { register, handleSubmit, reset, setValue, formState: { errors, isSubmitting } } = useForm<SoftwareFormData>({
    defaultValues: {
      status: 'Planned'
    }
  });

  const { data: software } = useQuery({
    queryKey: ['software', id],
    queryFn: () => api.getSoftware(id!),
    enabled: isEditing
  });

  const { data: nextItemData } = useQuery({
    queryKey: ['next-software-item-number'],
    queryFn: api.getNextSoftwareItemNumber,
    enabled: !isEditing
  });

  const { data: publishers } = useQuery({
    queryKey: ['softwarePublishers'],
    queryFn: api.getSoftwarePublishers
  });
  const { data: categories } = useQuery({
    queryKey: ['softwareCategories'],
    queryFn: api.getSoftwareCategories
  });
  const { data: suppliers } = useQuery({
    queryKey: ['suppliers'],
    queryFn: api.getSuppliers
  });

  useEffect(() => {
    if (!isEditing && nextItemData?.nextItemNumber) {
      setValue('itemNumber', nextItemData.nextItemNumber);
    }
  }, [isEditing, nextItemData, setValue]);

  useEffect(() => {
    if (software) {
      reset({
        itemNumber: software.itemNumber || '',
        name: software.name || '',
        publisherId: software.publisherId || '',
        categoryId: software.categoryId || '',
        description: software.description || '',
        version: software.version || '',
        url: software.url || '',
        appStore: software.appStore || '',
        deploymentMechanism: software.deploymentMechanism || '',
        status: software.status || 'Planned',
        businessPurpose: software.businessPurpose || '',
        businessOwner: software.businessOwner || '',
        technicalOwner: software.technicalOwner || '',
        initialInstallDate: software.initialInstallDate ? software.initialInstallDate.split('T')[0] : '',
        licenseExpiration: software.licenseExpiration ? software.licenseExpiration.split('T')[0] : '',
        licenseCount: software.licenseCount?.toString() || '',
        supplierId: software.supplierId || '',
        lastReviewDate: software.lastReviewDate ? software.lastReviewDate.split('T')[0] : '',
        decommissionDate: software.decommissionDate ? software.decommissionDate.split('T')[0] : '',
        comments: software.comments || '',
        criticalityTier: software.criticalityTier || '',
        dataClassification: software.dataClassification || '',
        hostingType: software.hostingType || '',
        supportType: software.supportType || '',
        internetFacing: software.internetFacing === null || software.internetFacing === undefined ? '' : String(software.internetFacing)
      });
    }
  }, [software, reset]);

  const createMutation = useMutation({
    mutationFn: (data: Partial<Software>) => api.createSoftware(data),
    onSuccess: (newSoftware) => {
      queryClient.invalidateQueries({ queryKey: ['software'] });
      navigate(`/software/${newSoftware.id}`);
    }
  });

  const updateMutation = useMutation({
    mutationFn: (data: Partial<Software>) => api.updateSoftware(id!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['software'] });
      queryClient.invalidateQueries({ queryKey: ['software', id] });
      navigate(`/software/${id}`);
    }
  });

  const onSubmit = (data: SoftwareFormData) => {
    const cleanData: Record<string, any> = {};
    Object.entries(data).forEach(([key, value]) => {
      cleanData[key] = value === '' ? null : value;
    });

    cleanData.internetFacing = data.internetFacing === '' ? null : data.internetFacing === 'true';
    cleanData.licenseCount = data.licenseCount === '' ? null : parseInt(data.licenseCount, 10);

    if (isEditing) {
      updateMutation.mutate(cleanData);
    } else {
      createMutation.mutate(cleanData);
    }
  };

  const mutation = isEditing ? updateMutation : createMutation;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link to={isEditing ? `/software/${id}` : '/software'} className="p-2 rounded-md hover:bg-gray-100">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">
          {isEditing ? 'Edit Software' : 'Add New Software'}
        </h1>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {mutation.error && (
          <div className="rounded-md bg-red-50 p-4">
            <p className="text-sm text-red-700">{(mutation.error as Error).message}</p>
          </div>
        )}

        {/* Basic Info */}
        <div className="card p-6">
          <h2 className="text-lg font-semibold mb-4">Basic Information</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <FieldLabel text="Item Number" required help="Unique identifier for this software item, used in the software register export." />
              <input
                {...register('itemNumber', { required: 'Item number is required' })}
                className="input"
                placeholder="e.g., SW-001"
              />
              {errors.itemNumber && (
                <p className="mt-1 text-sm text-red-600">{errors.itemNumber.message}</p>
              )}
            </div>
            <div>
              <FieldLabel text="Name" required help="The software's title / product name." />
              <input
                {...register('name', { required: 'Name is required' })}
                className="input"
              />
              {errors.name && (
                <p className="mt-1 text-sm text-red-600">{errors.name.message}</p>
              )}
            </div>
            <div>
              <FieldLabel text="Publisher" help="The company that publishes this software." />
              <select {...register('publisherId')} className="input">
                <option value="">Select publisher...</option>
                {publishers?.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <div>
              <FieldLabel text="Category" help="The type of software (e.g. Productivity Suite, Security)." />
              <select {...register('categoryId')} className="input">
                <option value="">Select category...</option>
                {categories?.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <FieldLabel text="Version" help="The version currently installed or licensed." />
              <input {...register('version')} className="input" />
            </div>
            <div>
              <FieldLabel text="Status" help="The software's current lifecycle status." />
              <select {...register('status')} className="input">
                {Object.entries(SOFTWARE_STATUS_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
            <div>
              <FieldLabel text="URL" help="Login or product URL for this software." />
              <input {...register('url')} className="input" placeholder="https://..." />
            </div>
            <div>
              <FieldLabel text="App Store" help="Which app store(s) this software is distributed through, if applicable." />
              <input {...register('appStore')} className="input" placeholder="e.g., Apple App Store, Google Play" />
            </div>
            <div className="md:col-span-2">
              <FieldLabel text="Description" help="Free-text description of the software." />
              <textarea {...register('description')} className="input" rows={3} />
            </div>
          </div>
        </div>

        {/* Ownership & Purpose */}
        <div className="card p-6">
          <h2 className="text-lg font-semibold mb-4">Ownership & Purpose</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <FieldLabel text="Business Purpose" help="The business process or service this software supports." />
              <textarea {...register('businessPurpose')} className="input" rows={2} />
            </div>
            <div>
              <FieldLabel text="Business Owner" help="The person or role accountable for this software's business use (e.g. Principal, Business Manager)." />
              <input {...register('businessOwner')} className="input" placeholder="e.g., Principal, Business Manager" />
            </div>
            <div>
              <FieldLabel text="Technical Owner" help="The person or role responsible for this software's technical upkeep (e.g. IT Coordinator)." />
              <input {...register('technicalOwner')} className="input" placeholder="e.g., IT Coordinator" />
            </div>
          </div>
        </div>

        {/* Licensing & Deployment */}
        <div className="card p-6">
          <h2 className="text-lg font-semibold mb-4">Licensing & Deployment</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <FieldLabel text="Deployment Mechanism" help="How this software is deployed to devices (e.g. Intune, manual install, web-based)." />
              <input {...register('deploymentMechanism')} className="input" placeholder="e.g., Intune, Manual install" />
            </div>
            <div>
              <FieldLabel text="Initial Install Date" help="The date this software was first installed or put into use." />
              <input {...register('initialInstallDate')} type="date" className="input" />
            </div>
            <div>
              <FieldLabel text="License Expiration" help="The date the license or subscription needs to be renewed." />
              <input {...register('licenseExpiration')} type="date" className="input" />
            </div>
            <div>
              <FieldLabel text="License Count" help="The number of licenses/seats purchased." />
              <input {...register('licenseCount')} type="number" min="0" className="input" />
            </div>
            <div>
              <FieldLabel text="Supplier" help="The vendor or reseller this software was purchased from." />
              <select {...register('supplierId')} className="input">
                <option value="">Select supplier...</option>
                {suppliers?.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <div>
              <FieldLabel text="Last Review Date" help="The date this software's record was last reviewed for accuracy." />
              <input {...register('lastReviewDate')} type="date" className="input" />
            </div>
            <div>
              <FieldLabel text="Decommission Date" help="The date this software was, or is planned to be, retired." />
              <input {...register('decommissionDate')} type="date" className="input" />
            </div>
          </div>
        </div>

        {/* Compliance / Governance */}
        <div className="card p-6">
          <h2 className="text-lg font-semibold mb-4">Compliance / Governance</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <FieldLabel text="Criticality" help="How severe the impact would be if this software were compromised or unavailable. Critical means essential to core school operations or child safety." />
              <select {...register('criticalityTier')} className="input">
                <option value="">Not set</option>
                {Object.entries(CRITICALITY_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
            <div>
              <FieldLabel text="Data Classification" help="The sensitivity of the most sensitive data this software stores or processes." />
              <select {...register('dataClassification')} className="input">
                <option value="">Not set</option>
                {Object.entries(DATA_CLASSIFICATION_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
            <div>
              <FieldLabel text="Hosting" help="Where this software (or the data/service it provides) is hosted." />
              <select {...register('hostingType')} className="input">
                <option value="">Not set</option>
                {Object.entries(HOSTING_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
            <div>
              <FieldLabel text="Support Type" help="Who provides technical support for this software." />
              <select {...register('supportType')} className="input">
                <option value="">Not set</option>
                {Object.entries(SUPPORT_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
            <div>
              <FieldLabel text="Internet Facing" help="Whether this software is directly accessible from the internet." />
              <select {...register('internetFacing')} className="input">
                <option value="">Unknown</option>
                <option value="true">Yes</option>
                <option value="false">No</option>
              </select>
            </div>
          </div>
        </div>

        {/* Comments */}
        <div className="card p-6">
          <h2 className="text-lg font-semibold mb-4">Comments / Supporting Notes</h2>
          <textarea {...register('comments')} className="input" rows={4} />
        </div>

        {/* Submit */}
        <div className="flex justify-end gap-4">
          <Link
            to={isEditing ? `/software/${id}` : '/software'}
            className="btn btn-secondary"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={isSubmitting || mutation.isPending}
            className="btn btn-primary"
          >
            <Save className="w-4 h-4 mr-2" />
            {mutation.isPending ? 'Saving...' : (isEditing ? 'Update Software' : 'Create Software')}
          </button>
        </div>
      </form>
    </div>
  );
}
