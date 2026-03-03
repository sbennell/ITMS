import { useState } from 'react';
import { Download, X } from 'lucide-react';
import { api } from '../lib/api';

interface StudentLoginCardsModalProps {
  onClose: () => void;
  yearLevels: string[];
  homeGroups: string[];
}

type CardScope = 'all' | 'byYearLevel' | 'byHomeGroup';

export default function StudentLoginCardsModal({
  onClose,
  yearLevels,
  homeGroups
}: StudentLoginCardsModalProps) {
  const [scope, setScope] = useState<CardScope>('all');
  const [selectedYearLevel, setSelectedYearLevel] = useState('');
  const [selectedHomeGroup, setSelectedHomeGroup] = useState('');
  const [isDownloading, setIsDownloading] = useState(false);

  const handleDownload = async () => {
    try {
      setIsDownloading(true);
      const params: { schoolYear?: string; homeGroup?: string } = {};

      if (scope === 'byYearLevel' && selectedYearLevel) {
        params.schoolYear = selectedYearLevel;
      } else if (scope === 'byHomeGroup' && selectedHomeGroup) {
        params.homeGroup = selectedHomeGroup;
      }

      const url = api.getStudentLoginCardsUrl(params);
      window.open(url, '_blank');
    } finally {
      setIsDownloading(false);
      onClose();
    }
  };

  const canDownload =
    scope === 'all' ||
    (scope === 'byYearLevel' && selectedYearLevel) ||
    (scope === 'byHomeGroup' && selectedHomeGroup);

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-75 z-40 flex items-center justify-center">
      <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Download Login Cards</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X size={20} />
          </button>
        </div>

        {/* Scope selection */}
        <div className="space-y-3 mb-6">
          <label className="block text-sm font-medium text-gray-700">
            Select cards to download:
          </label>

          {/* All Students */}
          <label className="flex items-center">
            <input
              type="radio"
              name="scope"
              value="all"
              checked={scope === 'all'}
              onChange={(e) => setScope(e.target.value as CardScope)}
              className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
            />
            <span className="ml-3 text-sm text-gray-700">All Students</span>
          </label>

          {/* By Year Level */}
          <label className="flex items-center">
            <input
              type="radio"
              name="scope"
              value="byYearLevel"
              checked={scope === 'byYearLevel'}
              onChange={(e) => setScope(e.target.value as CardScope)}
              className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
            />
            <span className="ml-3 text-sm text-gray-700">By Year Level</span>
          </label>

          {scope === 'byYearLevel' && (
            <select
              value={selectedYearLevel}
              onChange={(e) => setSelectedYearLevel(e.target.value)}
              className="ml-6 input text-sm"
            >
              <option value="">— Select a year level —</option>
              {yearLevels.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          )}

          {/* By Home Group */}
          <label className="flex items-center">
            <input
              type="radio"
              name="scope"
              value="byHomeGroup"
              checked={scope === 'byHomeGroup'}
              onChange={(e) => setScope(e.target.value as CardScope)}
              className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
            />
            <span className="ml-3 text-sm text-gray-700">By Home Group</span>
          </label>

          {scope === 'byHomeGroup' && (
            <select
              value={selectedHomeGroup}
              onChange={(e) => setSelectedHomeGroup(e.target.value)}
              className="ml-6 input text-sm"
            >
              <option value="">— Select a home group —</option>
              {homeGroups.map((group) => (
                <option key={group} value={group}>
                  {group}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Info text */}
        <p className="text-xs text-gray-500 mb-6">
          {scope === 'all'
            ? 'Downloads all active students with 16 cards per page (excludes "Left" status)'
            : scope === 'byYearLevel'
            ? 'Downloads selected year level with 16 cards per page'
            : 'Downloads selected home group with 16 cards per page'}
        </p>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 btn btn-secondary"
          >
            Cancel
          </button>
          <button
            onClick={handleDownload}
            disabled={!canDownload || isDownloading}
            className="flex-1 btn btn-primary disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            <Download size={18} />
            {isDownloading ? 'Downloading...' : 'Download PDF'}
          </button>
        </div>
      </div>
    </div>
  );
}
